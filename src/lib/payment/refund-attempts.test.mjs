import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';

const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'server-only') return undefined;
  return originalLoad.call(this, request, ...args);
};
const {
  reserveCancellationRefundAttempt,
  transitionRefundAttempt,
} = await import('@/lib/payment/refund-attempts');
Module._load = originalLoad;

const orderId = 'order-refund-attempt-unit';
const customerId = 'customer-refund-attempt-unit';
const paymentId = 'pay-refund-attempt-unit';

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function makeDb(initialOrder = {}) {
  const records = new Map();
  records.set(`orders/${orderId}`, {
    customerId,
    orderStatus: 'confirmed',
    cancellationStatus: 'processing',
    items: [{ fulfillmentStatus: 'pending' }],
    pricing: { totalAmount: 125 },
    payment: { method: 'razorpay', status: 'captured', razorpayPaymentId: paymentId },
    ...copy(initialOrder),
  });
  let nextId = 0;
  let queue = Promise.resolve();
  let failNextTransaction = false;

  function ref(path) {
    const segments = path.split('/');
    return {
      id: segments.at(-1),
      path,
      collection(name) {
        return collection(`${path}/${name}`);
      },
    };
  }

  function collection(path) {
    return {
      doc(id) {
        return ref(`${path}/${id ?? `attempt-${++nextId}`}`);
      },
    };
  }

  function apply(path, changes) {
    const record = copy(records.get(path) || {});
    for (const [key, value] of Object.entries(changes)) {
      const parts = key.split('.');
      let cursor = record;
      for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
      cursor[parts.at(-1)] = copy(value);
    }
    records.set(path, record);
  }

  const db = {
    collection,
    runTransaction(callback) {
      const execution = queue.then(async () => {
        const writes = [];
        let hasWritten = false;
        const transaction = {
          get: async (documentRef) => {
            assert.equal(hasWritten, false, `Firestore read after write: ${documentRef.path}`);
            const data = records.get(documentRef.path);
            return { exists: data !== undefined, data: () => copy(data) };
          },
          create: (documentRef, data) => {
            hasWritten = true;
            writes.push(() => {
              if (records.has(documentRef.path)) throw new Error(`Document already exists: ${documentRef.path}`);
              records.set(documentRef.path, copy(data));
            });
          },
          update: (documentRef, changes) => {
            hasWritten = true;
            writes.push(() => apply(documentRef.path, changes));
          },
        };
        const result = await callback(transaction);
        if (failNextTransaction) {
          failNextTransaction = false;
          throw new Error('synthetic transaction failure');
        }
        writes.forEach((write) => write());
        return result;
      });
      queue = execution.then(() => undefined, () => undefined);
      return execution;
    },
  };

  return {
    db,
    get(path) { return copy(records.get(path)); },
    paths() { return [...records.keys()]; },
    failNext() { failNextTransaction = true; },
  };
}

async function reserve(harness) {
  return reserveCancellationRefundAttempt(orderId, customerId, harness.db);
}

async function makeUnknownAttempt(harness) {
  const reservation = await reserve(harness);
  assert.equal(reservation.kind, 'reserved');
  const transition = await transitionRefundAttempt(
    orderId, reservation.attempt.id, 'submission_unknown', undefined, harness.db,
  );
  assert.equal(transition.kind, 'transitioned');
  return reservation.attempt.id;
}

function evidence(overrides = {}) {
  return {
    source: 'provider_api',
    orderId,
    paymentId,
    amount: 12_500,
    currency: 'INR',
    refundId: 'rfnd-refund-attempt-unit',
    status: 'processed',
    ...overrides,
  };
}

test('reserves one durable attempt and returns it for duplicate requests', async () => {
  const harness = makeDb();
  const first = await reserve(harness);
  const second = await reserve(harness);

  assert.equal(first.kind, 'reserved');
  assert.equal(second.kind, 'existing');
  assert.equal(second.attempt.id, first.attempt.id);
  assert.equal(harness.paths().filter((path) => path.includes('/refundAttempts/')).length, 1);
  assert.equal(harness.get(`orders/${orderId}`).payment.activeRefundAttemptId, first.attempt.id);
});

test('concurrent reservations converge on one attempt document', async () => {
  const harness = makeDb();
  const results = await Promise.all([reserve(harness), reserve(harness), reserve(harness)]);

  assert.ok(results.every((result) => result.kind === 'reserved' || result.kind === 'existing'));
  assert.equal(new Set(results.map((result) => result.attempt.id)).size, 1);
  assert.equal(harness.paths().filter((path) => path.includes('/refundAttempts/')).length, 1);
});

test('allows only the declared transitions with matching provider evidence', async () => {
  const harness = makeDb();
  const attemptId = await makeUnknownAttempt(harness);
  const identified = await transitionRefundAttempt(
    orderId, attemptId, 'provider_identified', evidence({ status: 'pending' }), harness.db,
  );
  assert.equal(identified.kind, 'transitioned');
  assert.equal(identified.attempt.state, 'provider_identified');

  const succeeded = await transitionRefundAttempt(
    orderId, attemptId, 'succeeded', evidence(), harness.db,
  );
  assert.equal(succeeded.kind, 'transitioned');
  assert.equal(succeeded.attempt.providerRefundId, 'rfnd-refund-attempt-unit');
  assert.equal(succeeded.attempt.providerStatus, 'processed');
});

test('rejects forbidden transitions and keeps ambiguous outcomes unresolved', async () => {
  const harness = makeDb();
  const attemptId = await makeUnknownAttempt(harness);
  const reset = await transitionRefundAttempt(orderId, attemptId, 'not_submitted', undefined, harness.db);
  const withoutEvidence = await transitionRefundAttempt(orderId, attemptId, 'succeeded', undefined, harness.db);
  const duplicateUnknown = await transitionRefundAttempt(orderId, attemptId, 'submission_unknown', undefined, harness.db);

  assert.equal(reset.kind, 'invalid_transition');
  assert.equal(withoutEvidence.kind, 'invalid_evidence');
  assert.equal(duplicateUnknown.kind, 'already_applied');
  assert.equal(harness.get(`orders/${orderId}/refundAttempts/${attemptId}`).state, 'submission_unknown');
});

test('rejects mismatched order, payment, amount, currency, refund ID, and provider status evidence', async (t) => {
  const mismatches = [
    ['order', { orderId: 'other-order' }],
    ['payment', { paymentId: 'other-payment' }],
    ['amount', { amount: 1 }],
    ['currency', { currency: 'USD' }],
    ['refund ID', { refundId: '' }],
    ['status', { status: 'created' }],
  ];

  for (const [label, override] of mismatches) {
    await t.test(label, async () => {
      const harness = makeDb();
      const attemptId = await makeUnknownAttempt(harness);
      const result = await transitionRefundAttempt(
        orderId, attemptId, 'succeeded', evidence(override), harness.db,
      );
      assert.equal(result.kind, 'invalid_evidence');
      assert.equal(harness.get(`orders/${orderId}/refundAttempts/${attemptId}`).state, 'submission_unknown');
    });
  }
});

test('terminal outcomes are idempotent for matching evidence and cannot be changed', async () => {
  const harness = makeDb();
  const attemptId = await makeUnknownAttempt(harness);
  const terminalEvidence = evidence();
  const first = await transitionRefundAttempt(orderId, attemptId, 'succeeded', terminalEvidence, harness.db);
  const duplicate = await transitionRefundAttempt(orderId, attemptId, 'succeeded', terminalEvidence, harness.db);
  const downgrade = await transitionRefundAttempt(
    orderId, attemptId, 'failed', evidence({ status: 'failed' }), harness.db,
  );

  assert.equal(first.kind, 'transitioned');
  assert.equal(duplicate.kind, 'already_applied');
  assert.equal(downgrade.kind, 'invalid_transition');
  assert.equal(harness.get(`orders/${orderId}/refundAttempts/${attemptId}`).state, 'succeeded');
});

test('provider-confirmed failure is terminal and cannot be changed to success', async () => {
  const harness = makeDb();
  const attemptId = await makeUnknownAttempt(harness);
  const failedEvidence = evidence({ status: 'failed' });
  const first = await transitionRefundAttempt(orderId, attemptId, 'failed', failedEvidence, harness.db);
  const duplicate = await transitionRefundAttempt(orderId, attemptId, 'failed', failedEvidence, harness.db);
  const laterSuccess = await transitionRefundAttempt(
    orderId, attemptId, 'succeeded', evidence(), harness.db,
  );

  assert.equal(first.kind, 'transitioned');
  assert.equal(duplicate.kind, 'already_applied');
  assert.equal(laterSuccess.kind, 'invalid_transition');
  assert.equal(harness.get(`orders/${orderId}/refundAttempts/${attemptId}`).state, 'failed');
});

test('a correlated provider refund ID cannot be replaced during finalization', async () => {
  const harness = makeDb();
  const attemptId = await makeUnknownAttempt(harness);
  const identified = await transitionRefundAttempt(
    orderId, attemptId, 'provider_identified', evidence({ status: 'pending' }), harness.db,
  );
  const mismatched = await transitionRefundAttempt(
    orderId, attemptId, 'succeeded', evidence({ refundId: 'rfnd-other-refund' }), harness.db,
  );
  const matching = await transitionRefundAttempt(
    orderId, attemptId, 'succeeded', evidence(), harness.db,
  );

  assert.equal(identified.kind, 'transitioned');
  assert.equal(mismatched.kind, 'invalid_evidence');
  assert.equal(matching.kind, 'transitioned');
});

test('concurrent conflicting terminal evidence commits only one terminal transition', async () => {
  const harness = makeDb();
  const attemptId = await makeUnknownAttempt(harness);
  const results = await Promise.all([
    transitionRefundAttempt(orderId, attemptId, 'succeeded', evidence(), harness.db),
    transitionRefundAttempt(orderId, attemptId, 'failed', evidence({ status: 'failed' }), harness.db),
  ]);
  const storedAttempt = harness.get(`orders/${orderId}/refundAttempts/${attemptId}`);

  assert.equal(results.filter((result) => result.kind === 'transitioned').length, 1);
  assert.equal(results.filter((result) => result.kind === 'invalid_transition').length, 1);
  assert.ok(storedAttempt.state === 'succeeded' || storedAttempt.state === 'failed');
});

test('transaction failure leaves both the attempt and order pointer unchanged', async () => {
  const harness = makeDb();
  const reservation = await reserve(harness);
  assert.equal(reservation.kind, 'reserved');
  harness.failNext();

  await assert.rejects(
    transitionRefundAttempt(orderId, reservation.attempt.id, 'submission_unknown', undefined, harness.db),
    /synthetic transaction failure/,
  );
  assert.equal(harness.get(`orders/${orderId}/refundAttempts/${reservation.attempt.id}`).state, 'not_submitted');
  assert.equal(harness.get(`orders/${orderId}`).payment.activeRefundAttemptId, reservation.attempt.id);
});
