import { expect, test } from 'vitest';
import { PHYSICS_DT } from '@/config/constants';
import { CARS, TRACKS } from '@/data';
import { qRot } from '@/math/quat';
import { mul } from '@/math/vec3';
import { resolveBarriers, resolveBodyGround } from '@/physics/collision';
import { Vehicle } from '@/physics/vehicle';
import { Track } from '@/track/track';

const track = new Track({
  ...TRACKS.valley, runoffWidth: 4, runoffOverrides: [],
  controlPoints: [[0,0],[100,0],[200,0],[300,0],[400,100],[400,200],
    [300,300],[200,300],[100,300],[0,300],[-100,200],[-100,100]]
    .map(([x,z]) => ({ x, y: 0, z, halfWidth: 6, bankDeg: 0 })),
});
const input = { steer: 0, throttle: 0, brake: 0, handbrake: 0, shift: 0,
  assists: { abs: true, tcs: true, esc: false, autoGear: true } } as const;

test.each([
  { angle: 90, hit: 94, rebound: 2.86, maxPen: 0.05 },
  { angle: 60, hit: 107, rebound: 0.37, maxPen: 0.08 },
  { angle: 120, hit: 107, rebound: 0.37, maxPen: 0.08 },
])('barrier impact at $angle degrees matches the reference', ({ angle, hit, rebound, maxPen }) => {
  const vehicle = new Vehicle(CARS.hatch, track.query);
  vehicle.reset([150,0,0], Math.PI + (angle - 90) * Math.PI / 180);
  vehicle.vel = mul(qRot(vehicle.q, [0,0,1]), 20);
  vehicle.wheels.forEach(wheel => { wheel.omega = 20 / vehicle.cfg.wheel.radius; });

  let firstHit = -1;
  let vzAfter = NaN;
  let deepest = 0;
  for (let k = 0; k < Math.round(3 / PHYSICS_DT); k++) {
    vehicle.step(input, PHYSICS_DT);
    const contact = resolveBarriers(vehicle, track);
    resolveBodyGround(vehicle, track.query);
    deepest = Math.max(deepest, contact.maxPen);
    if (firstHit < 0 && contact.maxPen > 0) firstHit = k;
    if (firstHit >= 0 && k === firstHit + 120) vzAfter = vehicle.vel[2];
    expect([...vehicle.pos, ...vehicle.vel, ...vehicle.q, ...vehicle.angvel].every(Number.isFinite)).toBe(true);
  }

  expect(Math.abs(firstHit - hit)).toBeLessThanOrEqual(2);
  expect(Math.abs(vzAfter - rebound)).toBeLessThanOrEqual(0.3);
  expect(deepest).toBeLessThan(maxPen);
});

test('roof contacts push an overturned car out of the ground', () => {
  const vehicle = new Vehicle(CARS.hatch);
  vehicle.pos = [0,0.35,0];
  vehicle.q = [0,0,0,1];
  vehicle.vel = [0,-2,0];
  resolveBodyGround(vehicle, vehicle.ground);
  expect(vehicle.pos[1]).toBeGreaterThan(0.35);
  expect(vehicle.vel[1]).toBeGreaterThan(-2);
});
