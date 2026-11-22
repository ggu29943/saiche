import { expect, test } from 'vitest';
import { CARS } from '@/data';
import { mfPeakX, tyreForces } from '@/physics/tyre';

test('longitudinal and lateral slip peaks match reference scans', () => {
  expect(Math.abs(mfPeakX(14, 1.5, -0.2) - 0.11519)).toBeLessThanOrEqual(1e-5);
  expect(Math.abs(mfPeakX(15, 1.4, 0) - 0.13843)).toBeLessThanOrEqual(1e-5);
});

test('unloaded tyres generate no force', () => {
  expect(tyreForces(0.5, 0.3, 0, CARS.hatch.tire, 1, 0.11519, 0.13843)).toEqual([0, 0]);
});
