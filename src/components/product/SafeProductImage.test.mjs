import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SafeProductImage } from './SafeProductImage.tsx';

test('renders a placeholder for a product image host outside the Next allowlist', () => {
  const markup = renderToStaticMarkup(React.createElement(SafeProductImage, {
    src: 'https://example.test/product.jpg',
    alt: 'Synthetic product',
    sizes: '48px',
  }));

  assert.match(markup, /role="img"/);
  assert.match(markup, /Synthetic product image unavailable/);
  assert.doesNotMatch(markup, /_next\/image/);
});

test('renders the same placeholder when the order image is missing', () => {
  const markup = renderToStaticMarkup(React.createElement(SafeProductImage, {
    src: undefined,
    alt: 'Synthetic product',
    sizes: '48px',
  }));

  assert.match(markup, /Synthetic product image unavailable/);
  assert.doesNotMatch(markup, /_next\/image/);
});
