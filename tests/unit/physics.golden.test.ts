import { expect, test } from 'vitest';
import hatch from '../../reference/golden/physics_hatch.json';
import coupe from '../../reference/golden/physics_coupe.json';
import rally from '../../reference/golden/physics_rally.json';
import { CAR_IDS, CARS } from '@/data';
import { PHYSICS_DT } from '@/config/constants';
import { Vehicle } from '@/physics/vehicle';

const golden = { hatch, coupe, rally };
const assists = { abs: true, tcs: true, esc: false, autoGear: true };
function script(t: number) {
  if (t < 2) return { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
  if (t < 6) return { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  if (t < 8) return { steer: Math.min(1, (t - 6) / 2) * 0.3, throttle: 0.5, brake: 0, handbrake: 0 };
  if (t < 9) return { steer: 0.3, throttle: 0, brake: 1, handbrake: 0 };
  return { steer: -0.2, throttle: 0.3, brake: 0, handbrake: 0 };
}

test.each(CAR_IDS)('%s matches all reference samples', id => {
  const vehicle = new Vehicle(CARS[id]), reference = golden[id];
  expect(Math.abs(vehicle.kp - reference.kp)).toBeLessThanOrEqual(1e-9);
  expect(Math.abs(vehicle.ap - reference.ap)).toBeLessThanOrEqual(1e-9);
  for (let k = 0; k < 2400; k++) {
    vehicle.step({ ...script(k * PHYSICS_DT), shift: 0, assists }, PHYSICS_DT);
    if ((k + 1) % 120 !== 0) continue;
    const sample = reference.samples[(k + 1) / 120 - 1];
    const fields = {
      pos: [vehicle.pos, sample.pos, 1e-3], q: [vehicle.q, sample.q, 1e-4],
      vel: [vehicle.vel, sample.vel, 1e-3], angvel: [vehicle.angvel, sample.angvel, 1e-3],
      rpm: [[vehicle.rpm], [sample.rpm], 0.5], gear: [[vehicle.gear], [sample.gear], 0],
      omega: [vehicle.wheels.map(w => w.omega), sample.omega, 1e-2],
      Fz: [vehicle.wheels.map(w => w.Fz), sample.Fz, 1],
    } as const;
    const differences: Record<string, number[]> = {};
    let matches = true;
    for (const [field, [actual, expected, tolerance]] of Object.entries(fields)) {
      differences[field] = actual.map((value, i) => value - expected[i]);
      if (!differences[field].every(delta => Math.abs(delta) <= tolerance)) matches = false;
    }
    expect(matches, JSON.stringify({ time: sample.t, differences })).toBe(true);
  }
});
