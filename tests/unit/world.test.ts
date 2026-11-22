import { expect, test } from 'vitest';
import { PHYSICS_DT } from '@/config/constants';
import { CARS } from '@/data';
import type { DriveInput } from '@/physics/types';
import { Vehicle } from '@/physics/vehicle';
import { PhysicsWorld } from '@/physics/world';

test('fixed step accumulator, frame cap, and previous pose interpolation', () => {
  const car = new Vehicle(CARS.hatch);
  const world = new PhysicsWorld(car);
  const input = (): DriveInput => ({ throttle: 0, brake: 0, steer: 0, shift: 0, handbrake: 0,
    assists: { autoGear: true, abs: true, tcs: true, esc: false } });
  let count = 0;
  const afterStep = () => { count++; };
  world.advance(0.01, input, afterStep);
  expect(count).toBe(2);
  expect(Math.abs(world.accumulator - (0.01 - 2 * PHYSICS_DT))).toBeLessThan(1e-9);
  world.advance(0.5, input, afterStep);
  expect(count).toBe(14);
  expect(world.accumulator).toBe(0);
  expect(world.interpolated().pos).toEqual(world.prev.pos);
  world.prev.q.forEach((value, i) => expect(world.interpolated().q[i]).toBeCloseTo(value, 12));
});
