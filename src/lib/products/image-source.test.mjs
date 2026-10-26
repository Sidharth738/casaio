import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSafeProductImageSource } from './image-source.ts';

test('allows configured HTTPS product image hosts', () => {
  assert.equal(
    getSafeProductImageSource('https://images.unsplash.com/photo.jpg'),
    'https://images.unsplash.com/photo.jpg',
  );
  assert.equal(
    getSafeProductImageSource('https://firebasestorage.googleapis.com/v0/b/bucket/image.jpg'),
    'https://firebasestorage.googleapis.com/v0/b/bucket/image.jpg',
  );
});

test('allows root-relative local product image sources', () => {
  assert.equal(getSafeProductImageSource('/casaio-logo.png'), '/casaio-logo.png');
});

test('rejects placeholder and unconfigured external hosts', () => {
  assert.equal(getSafeProductImageSource('https://example.test/product.jpg'), null);
  assert.equal(getSafeProductImageSource('https://images.unsplash.com.evil.test/photo.jpg'), null);
});

test('rejects invalid, insecure, credentialed, and protocol-relative sources', () => {
  assert.equal(getSafeProductImageSource('not a URL'), null);
  assert.equal(getSafeProductImageSource('http://images.unsplash.com/photo.jpg'), null);
  assert.equal(getSafeProductImageSource('https://user:pass@images.unsplash.com/photo.jpg'), null);
  assert.equal(getSafeProductImageSource('//images.unsplash.com/photo.jpg'), null);
  assert.equal(getSafeProductImageSource(undefined), null);
});
