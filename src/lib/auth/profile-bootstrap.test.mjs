import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfileBootstrapLoader, getProfileFailureCategory } from './profile-bootstrap.ts';

const user = { uid: 'synthetic-profile-user', emailVerified: true };

test('concurrent profile loads share one server bootstrap and one profile read', async () => {
  let finishSession;
  const calls = [];
  const loader = createProfileBootstrapLoader(
    async (account) => {
      calls.push(`session:${account.uid}`);
      await new Promise((resolve) => { finishSession = resolve; });
    },
    async (account) => {
      calls.push(`profile:${account.uid}`);
      return { uid: account.uid, role: 'customer' };
    },
  );

  const first = loader(user);
  const second = loader(user);
  await Promise.resolve();
  assert.deepEqual(calls, [`session:${user.uid}`]);
  finishSession();

  assert.deepEqual(await Promise.all([first, second]), [
    { uid: user.uid, role: 'customer' },
    { uid: user.uid, role: 'customer' },
  ]);
  assert.deepEqual(calls, [`session:${user.uid}`, `profile:${user.uid}`]);
});

test('a missing profile is read after the server session bootstrap creates it', async () => {
  let storedProfile = null;
  const loader = createProfileBootstrapLoader(
    async (account) => {
      storedProfile = { uid: account.uid, role: 'customer', createdAt: 'server-created' };
    },
    async (account) => {
      assert.ok(storedProfile);
      assert.equal(storedProfile.uid, account.uid);
      return storedProfile;
    },
  );

  assert.deepEqual(await loader(user), {
    uid: user.uid,
    role: 'customer',
    createdAt: 'server-created',
  });
});

test('an existing profile is returned without client-side replacement', async () => {
  const existingProfile = {
    uid: user.uid,
    role: 'seller',
    status: 'active',
    displayName: 'Existing Name',
    createdAt: 'original-created-at',
  };
  let serverBootstrapCalls = 0;
  const loader = createProfileBootstrapLoader(
    async () => { serverBootstrapCalls += 1; },
    async () => existingProfile,
  );

  assert.equal(await loader(user), existingProfile);
  assert.equal(existingProfile.createdAt, 'original-created-at');
  assert.equal(serverBootstrapCalls, 1);
});

test('session failure prevents profile reads and remains observable', async () => {
  let profileReads = 0;
  const failure = Object.assign(new Error('private detail'), { code: 'firestore/unavailable' });
  const loader = createProfileBootstrapLoader(
    async () => { throw failure; },
    async () => { profileReads += 1; return null; },
  );

  await assert.rejects(loader(user), (error) => error === failure);
  assert.equal(profileReads, 0);
  assert.equal(getProfileFailureCategory(failure, 'session-failed'), 'unavailable');
});

test('profile read failure is categorized without exposing its message', async () => {
  const failure = Object.assign(new Error('secret token and private detail'), { code: 'permission-denied' });
  const loader = createProfileBootstrapLoader(async () => {}, async () => { throw failure; });

  await assert.rejects(loader(user), (error) => error === failure);
  assert.equal(getProfileFailureCategory(failure, 'profile-failed'), 'permission-denied');
  assert.equal(getProfileFailureCategory(new Error('private detail'), 'profile-failed'), 'profile-failed');
});

test('unrecognized SDK codes collapse to a safe category', () => {
  assert.equal(getProfileFailureCategory({ code: 'some/secret-internal-code', message: 'do-not-log' }), 'unknown');
});
