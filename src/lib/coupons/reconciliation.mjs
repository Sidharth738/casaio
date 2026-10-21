const CLASSIFICATIONS = ['consumed', 'reserved', 'eligible_for_release_review', 'ambiguous'];
const PAYMENT_STATUSES = new Set(['pending', 'authorized', 'captured', 'failed', 'refund_pending', 'refund_failed', 'refunded']);
const ORDER_STATUSES = new Set(['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled']);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isPseudonymousCustomerRef = (value) => typeof value === 'string' && /^p_[a-f0-9]{32,64}$/i.test(value);
const isSafeCount = (value) => Number.isSafeInteger(value) && value >= 0;
const isValidRupeeAmount = (value) => Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) &&
  Math.abs(value * 100 - Math.round(value * 100)) <= 1e-7;
const normalizeCode = (value) => value.trim().toUpperCase();

function addReason(target, code, evidence = []) {
  target.reasonCodes.push(code);
  for (const field of evidence) {
    if (!target.evidenceFields.includes(field)) target.evidenceFields.push(field);
  }
}

function validateCoupon(coupon, index) {
  const errors = [];
  if (!isRecord(coupon)) return { coupon: null, index, errors: ['COUPON_NOT_OBJECT'] };
  if (!isNonEmptyString(coupon.id)) errors.push('COUPON_ID_MISSING');
  if (!isNonEmptyString(coupon.code)) errors.push('COUPON_CODE_MISSING');
  if (!isSafeCount(coupon.usageLimit)) errors.push('COUPON_USAGE_LIMIT_INVALID');
  if (!isSafeCount(coupon.usageCount)) errors.push('COUPON_USAGE_COUNT_INVALID');
  if (isSafeCount(coupon.usageLimit) && isSafeCount(coupon.usageCount) && coupon.usageCount > coupon.usageLimit) errors.push('COUPON_USAGE_COUNT_EXCEEDS_LIMIT');
  if (coupon.perUserLimit !== undefined && !isSafeCount(coupon.perUserLimit)) errors.push('COUPON_PER_USER_LIMIT_INVALID');
  if (!['percentage', 'flat'].includes(coupon.discountType)) errors.push('COUPON_DISCOUNT_TYPE_INVALID');
  if (!Number.isFinite(coupon.discountValue) || coupon.discountValue < 0) errors.push('COUPON_DISCOUNT_VALUE_INVALID');
  if (!isNonEmptyString(coupon.validFrom) || !Number.isFinite(Date.parse(coupon.validFrom))) errors.push('COUPON_VALID_FROM_INVALID');
  if (!isNonEmptyString(coupon.validUntil) || !Number.isFinite(Date.parse(coupon.validUntil))) errors.push('COUPON_VALID_UNTIL_INVALID');
  if (typeof coupon.isActive !== 'boolean') errors.push('COUPON_ACTIVE_FLAG_INVALID');
  return { coupon, index, errors };
}

function validateOrderShape(order) {
  const errors = [];
  if (!isRecord(order)) return ['ORDER_NOT_OBJECT'];
  if (!isNonEmptyString(order.id)) errors.push('ORDER_ID_MISSING');
  if (!isPseudonymousCustomerRef(order.customerRef)) errors.push('CUSTOMER_PSEUDONYM_INVALID');
  if (!isNonEmptyString(order.createdAt) || !Number.isFinite(Date.parse(order.createdAt))) errors.push('ORDER_CREATED_AT_INVALID');
  if (!isRecord(order.couponApplied)) errors.push('COUPON_APPLICATION_MISSING');
  else {
    if (!isNonEmptyString(order.couponApplied.code)) errors.push('ORDER_COUPON_CODE_MISSING');
    if (!isValidRupeeAmount(order.couponApplied.discountAmount)) errors.push('ORDER_COUPON_DISCOUNT_INVALID');
    if (order.couponApplied.couponId !== undefined && !isNonEmptyString(order.couponApplied.couponId)) errors.push('ORDER_COUPON_ID_INVALID');
    if (order.couponApplied.couponId === undefined) errors.push('ORDER_COUPON_DOCUMENT_ID_MISSING');
  }
  if (!isRecord(order.pricing) || !isValidRupeeAmount(order.pricing.totalAmount)) {
    errors.push('PAYABLE_TOTAL_INVALID');
  }
  if (!isRecord(order.payment)) errors.push('PAYMENT_FIELDS_MISSING');
  else {
    if (!['razorpay', 'cod'].includes(order.payment.method)) errors.push('PAYMENT_METHOD_INVALID');
    if (!PAYMENT_STATUSES.has(order.payment.status)) errors.push('PAYMENT_STATUS_INVALID');
    for (const idField of ['paymentId', 'refundId']) {
      if (order.payment[idField] !== undefined && !isNonEmptyString(order.payment[idField])) errors.push(`PAYMENT_${idField.toUpperCase()}_INVALID`);
    }
  }
  if (!ORDER_STATUSES.has(order.orderStatus)) errors.push('ORDER_STATUS_INVALID');
  if (order.cancellationStatus !== undefined && !['none', 'processing', 'completed', 'failed'].includes(order.cancellationStatus)) errors.push('CANCELLATION_STATUS_INVALID');
  if (order.refunds !== undefined && !Array.isArray(order.refunds)) errors.push('REFUNDS_NOT_ARRAY');
  if (Array.isArray(order.refunds)) {
    for (const refund of order.refunds) {
      if (!isRecord(refund) || !isNonEmptyString(refund.id) || !isNonEmptyString(refund.orderId) || !isNonEmptyString(refund.paymentId) || !['pending', 'processed', 'failed'].includes(refund.status) ||
          !Number.isSafeInteger(refund.amountPaise) || refund.amountPaise < 0 || refund.currency !== 'INR') {
        errors.push('REFUND_EVIDENCE_INVALID');
        break;
      }
      if (refund.orderId !== order.id) errors.push('REFUND_ORDER_ID_MISMATCH');
    }
    if (isRecord(order.pricing) && Number.isFinite(order.pricing.totalAmount) && order.pricing.totalAmount >= 0) {
      const payableAmountPaise = Math.round(order.pricing.totalAmount * 100);
      if (order.refunds.some((refund) => isRecord(refund) && Number.isSafeInteger(refund.amountPaise) && refund.amountPaise > payableAmountPaise)) {
        errors.push('REFUND_AMOUNT_EXCEEDS_ORDER_TOTAL');
      }
    }
  }
  if (order.codCollection !== undefined && (!isRecord(order.codCollection) || order.codCollection.status !== 'collected' ||
      !isNonEmptyString(order.codCollection.collectedAt) || !Number.isFinite(Date.parse(order.codCollection.collectedAt)) ||
      !isNonEmptyString(order.codCollection.evidenceId))) errors.push('COD_COLLECTION_EVIDENCE_INVALID');
  return errors;
}

function classifyOrder(order, couponMap, codeMap, orderErrors, duplicateIds) {
  const result = {
    orderId: isNonEmptyString(order?.id) ? order.id : null,
    customerRef: isPseudonymousCustomerRef(order?.customerRef) ? order.customerRef : null,
    couponId: null,
    couponCode: isNonEmptyString(order?.couponApplied?.code) ? normalizeCode(order.couponApplied.code) : null,
    classification: 'ambiguous',
    reasonCodes: [],
    evidenceFields: [],
    requiresManualReview: true,
  };

  if (duplicateIds.has(order.id)) {
    for (const error of orderErrors) addReason(result, error);
    addReason(result, 'DUPLICATE_ORDER_ID', ['id']);
    return result;
  }

  const normalized = isNonEmptyString(order?.couponApplied?.code) ? normalizeCode(order.couponApplied.code) : '';
  const matches = normalized ? codeMap.get(normalized) || [] : [];
  const coupon = order?.couponApplied?.couponId ? couponMap.get(order.couponApplied.couponId) : null;
  if (!coupon || matches.length !== 1 || (order.couponApplied.couponId && coupon.code !== normalized)) {
    for (const error of orderErrors) addReason(result, error);
    addReason(result, matches.length > 1 ? 'COUPON_CODE_REUSED_OR_AMBIGUOUS' : 'COUPON_IDENTITY_UNRESOLVED', ['couponApplied.code', 'couponApplied.couponId']);
    return result;
  }
  result.couponId = coupon.id;
  if (orderErrors.length) {
    for (const error of orderErrors) addReason(result, error);
    return result;
  }
  if (coupon.errors.length) {
    addReason(result, 'COUPON_CONFIGURATION_INVALID', ['coupon.usageLimit', 'coupon.usageCount']);
    return result;
  }

  const payment = order.payment;
  if (payment.method === 'razorpay') {
    if (payment.status === 'captured' || payment.status === 'refunded') {
      const validRefunds = (order.refunds || []).filter((refund) => refund.status === 'processed' && refund.orderId === order.id && refund.paymentId === payment.paymentId && payment.paymentId && payment.refundId === refund.id);
      const fullRefund = validRefunds.find((refund) => refund.amountPaise === Math.round(order.pricing.totalAmount * 100) && refund.currency === 'INR');
      const pendingRefund = (order.refunds || []).some((refund) => refund.status === 'pending' && refund.orderId === order.id && refund.paymentId === payment.paymentId && payment.paymentId && payment.refundId === refund.id);
      const partialRefund = validRefunds.some((refund) => refund.amountPaise < Math.round(order.pricing.totalAmount * 100));
      if (fullRefund) {
        result.classification = 'eligible_for_release_review';
        addReason(result, 'FULL_REFUND_CONFIRMED_RELEASE_REVIEW_ONLY', ['payment.paymentId', 'payment.refundId', 'refunds[].amountPaise', 'refunds[].currency', 'pricing.totalAmount']);
      } else if (pendingRefund || payment.status === 'refund_pending') {
        result.classification = 'reserved';
        addReason(result, 'REFUND_PENDING', ['payment.status', 'refunds[].status']);
      } else if (payment.status === 'refunded') {
        addReason(result, 'REFUNDED_STATUS_WITHOUT_CONFIRMED_FULL_REFUND_EVIDENCE', ['payment.status', 'refunds']);
      } else {
        result.classification = 'consumed';
        addReason(result, partialRefund ? 'PARTIAL_REFUND_DOES_NOT_RELEASE_USE' : 'CAPTURED_PAYMENT_COUNTS_AS_USE', ['payment.status', 'payment.paymentId']);
        if (payment.status === 'refunded' && !fullRefund) addReason(result, 'FULL_REFUND_AMOUNT_OR_ID_EVIDENCE_MISSING', ['payment.status', 'refunds']);
      }
    } else if (payment.status === 'refund_pending') {
      result.classification = 'reserved';
      addReason(result, 'REFUND_PENDING', ['payment.status']);
    } else if (payment.status === 'failed') {
      result.classification = 'reserved';
      addReason(result, 'FAILURE_NOT_FINAL_LATE_CAPTURE_POSSIBLE', ['payment.status']);
    } else if (payment.status === 'authorized' || payment.status === 'pending') {
      result.classification = 'reserved';
      addReason(result, 'ONLINE_PAYMENT_NOT_FINAL', ['payment.status']);
    } else if (payment.status === 'refund_failed') {
      addReason(result, 'REFUND_FAILURE_REQUIRES_REVIEW', ['payment.status', 'payment.refundId']);
    } else {
      addReason(result, 'PAYMENT_STATE_INSUFFICIENT_FOR_RELEASE', ['payment.status']);
    }
  } else if (payment.method === 'cod') {
    if (order.codCollection?.status === 'collected') {
      result.classification = 'consumed';
      addReason(result, 'COD_COLLECTION_CONFIRMED', ['codCollection.status', 'codCollection.collectedAt', 'codCollection.evidenceId']);
    } else if (order.orderStatus === 'delivered') {
      addReason(result, 'COD_DELIVERED_WITHOUT_COLLECTION_EVIDENCE', ['orderStatus', 'codCollection']);
    } else if (order.orderStatus === 'cancelled' && order.cancellationStatus === 'completed') {
      result.classification = 'eligible_for_release_review';
      addReason(result, 'COD_CANCELLED_RELEASE_REVIEW_ONLY_COLLECTION_UNPROVEN', ['orderStatus', 'cancellationStatus']);
    } else {
      result.classification = 'reserved';
      addReason(result, 'COD_COLLECTION_NOT_CONFIRMED', ['payment.method', 'orderStatus', 'codCollection']);
    }
  }

  result.requiresManualReview = result.classification === 'ambiguous' || result.classification === 'eligible_for_release_review';
  return result;
}

/** Pure, local-only analysis. It accepts in-memory sanitized JSON and has no I/O or service dependencies. */
export function analyzeCouponReconciliation(input) {
  if (!isRecord(input) || input.schemaVersion !== 1 || !Array.isArray(input.coupons) || !Array.isArray(input.orders)) {
    throw new TypeError('Input must be schemaVersion 1 with coupons and orders arrays.');
  }

  const validatedCoupons = input.coupons.map(validateCoupon);
  const couponInputIssues = validatedCoupons
    .filter((item) => item.errors.length && (!item.coupon || !isNonEmptyString(item.coupon.id) || !isNonEmptyString(item.coupon.code)))
    .map((item) => ({
      index: item.index,
      couponId: isNonEmptyString(item.coupon?.id) ? item.coupon.id : null,
      code: isNonEmptyString(item.coupon?.code) ? normalizeCode(item.coupon.code) : null,
      reasonCodes: item.errors,
    }));
  const couponMap = new Map();
  const codeMap = new Map();
  for (const item of validatedCoupons) {
    const coupon = item.coupon;
    if (!coupon || !isNonEmptyString(coupon.id) || !isNonEmptyString(coupon.code)) continue;
    const normalizedCoupon = { ...coupon, id: coupon.id.trim(), code: normalizeCode(coupon.code), errors: item.errors };
    if (couponMap.has(normalizedCoupon.id)) {
      couponMap.get(normalizedCoupon.id).errors.push('DUPLICATE_COUPON_ID');
      normalizedCoupon.errors.push('DUPLICATE_COUPON_ID');
    } else couponMap.set(normalizedCoupon.id, normalizedCoupon);
    const ids = codeMap.get(normalizedCoupon.code) || [];
    ids.push(normalizedCoupon);
    codeMap.set(normalizedCoupon.code, ids);
  }

  const idCounts = new Map();
  for (const order of input.orders) if (isRecord(order) && isNonEmptyString(order.id)) idCounts.set(order.id, (idCounts.get(order.id) || 0) + 1);
  const duplicateIds = new Set([...idCounts].filter(([, count]) => count > 1).map(([id]) => id));
  const orders = input.orders.map((order) => classifyOrder(order, couponMap, codeMap, validateOrderShape(order), duplicateIds));
  const counts = Object.fromEntries(CLASSIFICATIONS.map((classification) => [classification, orders.filter((order) => order.classification === classification).length]));

  const coupons = [...couponMap.values()].map((coupon) => {
    const linked = orders.filter((order) => order.couponId === coupon.id);
    const customerCounts = new Map();
    for (const order of linked) {
      if (!order.customerRef || order.classification === 'ambiguous') continue;
      const customer = customerCounts.get(order.customerRef) || { totalCandidateUses: 0, consumed: 0, reserved: 0, eligibleForReleaseReview: 0 };
      customer.totalCandidateUses++;
      if (order.classification === 'consumed') customer.consumed++;
      if (order.classification === 'reserved') customer.reserved++;
      if (order.classification === 'eligible_for_release_review') customer.eligibleForReleaseReview++;
      customerCounts.set(order.customerRef, customer);
    }
    const perCustomer = [...customerCounts].map(([customerRef, value]) => ({
      customerRef,
      ...value,
      mayExceedPerUserLimit: isSafeCount(coupon.perUserLimit) ? value.totalCandidateUses > coupon.perUserLimit : null,
    }));
    const known = linked.filter((order) => order.classification !== 'ambiguous').length;
    const ambiguous = linked.filter((order) => order.classification === 'ambiguous').length;
    const stored = isSafeCount(coupon.usageCount) ? coupon.usageCount : null;
    const limit = isSafeCount(coupon.usageLimit) ? coupon.usageLimit : null;
    return {
      couponId: coupon.id,
      code: coupon.code,
      storedUsageCount: stored,
      usageLimit: limit,
      perUserLimit: isSafeCount(coupon.perUserLimit) ? coupon.perUserLimit : null,
      configurationIssues: coupon.errors,
      minimumClearlyEvidencedHistoricalUses: linked.filter((order) => order.classification === 'consumed').length,
      activeOrPotentiallyActiveReservations: linked.filter((order) => order.classification === 'reserved').length,
      releaseReviewCandidates: linked.filter((order) => order.classification === 'eligible_for_release_review').length,
      ambiguousOrUnmappedRecords: ambiguous + orders.filter((order) => order.couponId === null && order.couponCode === coupon.code).length,
      matchedNonAmbiguousOrderCount: known,
      diagnosticCounterDifference: stored === null ? null : stored - known,
      counterDifferenceIsProvenError: false,
      globalUsageLimitConcern: limit !== null && ((stored !== null && stored >= limit) || known > limit),
      customerCounts: perCustomer,
      possiblePerUserLimitExceedances: perCustomer.filter((customer) => customer.mayExceedPerUserLimit).map((customer) => customer.customerRef),
    };
  });

  return {
    schemaVersion: 1,
    mode: 'dry-run',
    summary: {
      ordersScanned: orders.length,
      countsByClassification: counts,
      malformedCouponRecords: couponInputIssues.length,
      ordersWithDuplicateIds: orders.filter((order) => order.reasonCodes.includes('DUPLICATE_ORDER_ID')).length,
      noCountersChanged: true,
    },
    couponInputIssues,
    coupons,
    orders,
  };
}
