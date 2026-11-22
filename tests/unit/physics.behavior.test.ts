import { expect, test } from 'vitest';
import { PHYSICS_DT, GRAVITY } from '@/config/constants';
import { CAR_IDS, CARS } from '@/data';
import { length, sub } from '@/math/vec3';
import { mulberry32 } from '@/math/rng';
import type { GroundFn, DriveInput } from '@/physics/types';
import { Vehicle } from '@/physics/vehicle';

const idle: DriveInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0, shift: 0,
  assists: { abs: true, tcs: true, esc: false, autoGear: true } };
const accelerationRange = { hatch: [6.5, 7.6], coupe: [5.5, 6.5], rally: [4.6, 5.6] };

test.each(CAR_IDS)('%s settles, accelerates to 100 and brakes to rest', id => {
  const car = new Vehicle(CARS[id]);
  for (let k = 0; k < 480; k++) car.step(idle);
  const load = car.wheels.reduce((sum, w) => sum + w.Fz, 0);
  expect(Math.abs(load / (car.cfg.mass * GRAVITY) - 1)).toBeLessThan(0.01);
  expect(length(car.vel)).toBeLessThan(0.01);

  let elapsed = 0;
  while (car.speedKmh() < 100 && elapsed < 15) {
    car.step({ ...idle, throttle: 1 });
    elapsed += PHYSICS_DT;
  }
  expect(elapsed).toBeGreaterThanOrEqual(accelerationRange[id][0]);
  expect(elapsed).toBeLessThanOrEqual(accelerationRange[id][1]);
  const braking = { ...idle, brake: 1 };
  let steps = 0;
  while (car.speedKmh() > 100 && steps++ < 2400) car.step(braking);
  const start = [...car.pos] as typeof car.pos;
  while (car.speedKmh() > 0.1 && steps++ < 2400) car.step(braking);
  expect(steps).toBeLessThan(2400);
  const distance = length(sub(car.pos, start));
  expect(distance).toBeGreaterThanOrEqual(37);
  expect(distance).toBeLessThanOrEqual(45);
});

test.each(CAR_IDS)('%s holds a 12% slope facing across and uphill', id => {
  const angle = Math.atan(0.12);
  const slope: GroundFn = x => ({ height: x * 0.12, normal: [-Math.sin(angle), Math.cos(angle), 0], surface: 'asphalt' });
  const car = new Vehicle(CARS[id], slope);
  for (const yaw of [0, Math.PI / 2]) {
    car.reset([0, 0, 0], yaw);
    for (let i = 0; i < 2400; i++) car.step({ ...idle, handbrake: 1 });
    expect(length(car.vel)).toBeLessThan(0.01);
  }
});

test.each(CAR_IDS)('%s stays finite under three seeds of random inputs for 60 seconds', id => {
  const car = new Vehicle(CARS[id]);
  for (const seed of [0, 1, 2]) {
    car.reset([0, 0, 0], 0);
    const random = mulberry32(seed);
    let steer = 0, throttle = 0, brake = 0;
    for (let i = 0; i < 14400; i++) {
      if (i % 60 === 0) {
        steer = 2 * random() - 1;
        throttle = random();
        brake = random() < 0.3 ? random() : 0;
      }
      car.step({ steer, throttle, brake, shift: 0, handbrake: random() < 0.01 ? 1 : 0,
        assists: { abs: random() < 0.5, tcs: random() < 0.5, esc: random() < 0.5, autoGear: true } });
      const values = [...car.pos, ...car.vel, ...car.angvel, ...car.q];
      if (!values.every(Number.isFinite) || length(car.angvel) >= 50) {
        throw new Error(JSON.stringify({ id, seed, step: i, values }));
      }
    }
  }
});
