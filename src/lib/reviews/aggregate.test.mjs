import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePublishedRatings } from './aggregate.ts';

const review = (rating, status = 'published') => ({ rating, status });

test('published aggregate recalculates average and count, excluding non-published reviews', () => {
  assert.deepEqual(calculatePublishedRatings([
    review(5), review(4), review(1, 'hidden'), review(2, 'pending'),
  ]), { average: 4.5, count: 2 });
});

test('empty published aggregate keeps the existing five-star display default and zero count', () => {
  assert.deepEqual(calculatePublishedRatings([review(3, 'hidden')]), { average: 5, count: 0 });
});
