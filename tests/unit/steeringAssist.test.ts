import { expect, test } from 'vitest';
import { CARS } from '@/data';
import { steeringAssist } from '@/input/steeringAssist';
import { qFromYaw } from '@/math/quat';
import { Vehicle } from '@/physics/vehicle';

test('hatch steering stays unrestricted at 10 km/h and approaches the high speed limit at 100 km/h', () => {
  const vehicle = new Vehicle(CARS.hatch);
  vehicle.vel = [0, 0, 10 / 3.6];
  expect(steeringAssist(1, vehicle, true)).toBe(1);

  vehicle.vel = [0, 0, 100 / 3.6];
  expect(Math.abs(steeringAssist(1, vehicle, true) - 0.2395)).toBeLessThanOrEqual(0.002);
  expect(steeringAssist(1, vehicle, false)).toBe(1);
});

test('steering assist uses longitudinal speed in either direction', () => {
  const vehicle = new Vehicle(CARS.hatch);
  vehicle.q = qFromYaw(Math.PI / 2);
  vehicle.vel = [-100 / 3.6, 0, 0];
  expect(Math.abs(steeringAssist(-1, vehicle, true) + 0.2395)).toBeLessThanOrEqual(0.002);

  vehicle.vel = [0, 0, 100 / 3.6];
  expect(steeringAssist(-1, vehicle, true)).toBe(-1);
});
