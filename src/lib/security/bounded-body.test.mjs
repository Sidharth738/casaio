import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readBoundedBody } from './bounded-body.ts';

test('bounded body reader accepts bodies at the limit', async () => {
  const body = new TextEncoder().encode('12345');
  const result = await readBoundedBody(new Request('http://example.test', { method: 'POST', body }), body.byteLength);
  assert.deepEqual([...result], [...body]);
});

test('bounded body reader rejects bodies over the limit', async () => {
  const result = await readBoundedBody(new Request('http://example.test', { method: 'POST', body: '123456' }), 5);
  assert.equal(result, null);
});
