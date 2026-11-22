import { expect, test } from 'vitest';
import { CAR_IDS, CARS, TRACKS } from '@/data';
test.each(CAR_IDS)('%s wheel order and reference load', id => {
  const car = CARS[id];
  expect(car.wheels.map(w => w.id)).toEqual(['FL', 'FR', 'RL', 'RR']);
  expect(car.tire.loadRef).toBe(Math.round(car.mass * 9.81 / 4));
});
test('control point counts', () => {
  expect(TRACKS.valley.controlPoints).toHaveLength(31);
  expect(TRACKS.coast.controlPoints).toHaveLength(30);
});
