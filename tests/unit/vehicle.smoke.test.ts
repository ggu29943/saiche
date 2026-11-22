import { expect, test } from 'vitest';
import { CARS } from '@/data';
import { Vehicle } from '@/physics/vehicle';
test('hatch settles to its static ride height', () => {
  const car = new Vehicle(CARS.hatch);
  for (let i = 0; i < 480; i++) car.step({
    steer: 0, throttle: 0, brake: 0, handbrake: 0, shift: 0,
    assists: { autoGear: true, abs: true, tcs: true, esc: false },
  });
  expect(car.pos.every(Number.isFinite)).toBe(true);
  expect(car.pos[1]).toBeGreaterThan(0.50);
  expect(car.pos[1]).toBeLessThan(0.54);
});
