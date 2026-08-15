import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERVALS, nextIntervalIndex, nextReviewDate, isDue } from '../js/core/srs.js';

test('intervals are exactly 1,3,7,10,14,19', () => {
  assert.deepEqual(INTERVALS, [1, 3, 7, 10, 14, 19]);
});

test('correct answer advances interval, capped at last', () => {
  assert.equal(nextIntervalIndex(-1, true), 0);
  assert.equal(nextIntervalIndex(0, true), 1);
  assert.equal(nextIntervalIndex(5, true), 5);
});

test('wrong answer resets to index 0', () => {
  assert.equal(nextIntervalIndex(4, false), 0);
});

test('nextReviewDate adds the interval days', () => {
  assert.equal(nextReviewDate(0, '2026-08-15T10:00:00.000Z'), '2026-08-16T10:00:00.000Z');
  assert.equal(nextReviewDate(5, '2026-08-15T10:00:00.000Z'), '2026-09-03T10:00:00.000Z');
});

test('isDue', () => {
  assert.equal(isDue(null, '2026-08-15T10:00:00.000Z'), true);
  assert.equal(isDue('2026-08-15T09:00:00.000Z', '2026-08-15T10:00:00.000Z'), true);
  assert.equal(isDue('2026-08-16T10:00:00.000Z', '2026-08-15T10:00:00.000Z'), false);
});
