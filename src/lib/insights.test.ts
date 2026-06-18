import { test, expect } from 'vitest';
import { barHeights } from './insights';

test('barHeights scales values proportionally to the max', () => {
  expect(barHeights([0, 50, 100], 100)).toEqual([0, 50, 100]);
});

test('barHeights returns zeros when all values are zero', () => {
  expect(barHeights([0, 0, 0], 80)).toEqual([0, 0, 0]);
});

test('barHeights returns an empty array for empty input', () => {
  expect(barHeights([], 80)).toEqual([]);
});

test('barHeights handles negative values as zero-height', () => {
  expect(barHeights([-10, 10], 100)).toEqual([0, 100]);
});
