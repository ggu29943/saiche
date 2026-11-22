import { expect, test } from 'vitest';
import { torqueCurve, diffSplit } from '@/physics/engine';

test('torque curve clamps endpoints and interpolates between samples', () => {
  const points: [number, number][] = [[2000, 90], [4000, 130], [5000, 120]];
  expect([500, 3000, 4500, 6500].map(rpm => torqueCurve(points, rpm))).toEqual([90, 110, 125, 120]);
});

test('differential distributes torque and limits transfer in both directions', () => {
  const config = { lockRatio: 0.2, preloadNm: 10, lockGain: 100 };
  expect(diffSplit(100, 1, 9, { ...config, type: 'open' })).toEqual([50, 50]);
  expect(diffSplit(100, 1, 9, { ...config, type: 'lsd' })).toEqual([65, 35]);
  expect(diffSplit(-100, 9, 1, { ...config, type: 'lsd' })).toEqual([-65, -35]);
});
