import { qInvRot, qRot } from '@/math/quat';
import { sign } from '@/math/scalar';
import { add, cross, dot, length, mul, sub, type V3 } from '@/math/vec3';
import type { Track } from '@/track/track';
import type { GroundFn } from './types';
import type { Vehicle } from './vehicle';

const barrierPoints: V3[] = [
  [0.9, 0, 2.15], [-0.9, 0, 2.15], [0.9, 0, -2.15], [-0.9, 0, -2.15],
  [0.9, 0, 0], [-0.9, 0, 0],
];
const bodyPoints: V3[] = [
  [0.9, 0.55, 2], [0.9, 0.55, -2], [-0.9, 0.55, 2], [-0.9, 0.55, -2],
  [0.9, -0.25, 2.1], [0.9, -0.25, -2.1], [-0.9, -0.25, 2.1], [-0.9, -0.25, -2.1],
];

function inverseInertiaWorld(vehicle: Vehicle, torque: V3): V3 {
  const local = qInvRot(vehicle.q, torque);
  const { x, y, z } = vehicle.cfg.inertia;
  return qRot(vehicle.q, [local[0] / x, local[1] / y, local[2] / z]);
}

export function applyContact(vehicle: Vehicle, point: V3, normal: V3, penetration: number,
  restitution: number, friction: number): number {
  const inverseMass = 1 / vehicle.cfg.mass;
  const arm = sub(point, vehicle.pos);
  const velocity = add(vehicle.vel, cross(vehicle.angvel, arm));
  const normalSpeed = dot(velocity, normal);
  let normalImpulse = 0;
  if (normalSpeed < 0) {
    const inverseEffectiveMass = (direction: V3) =>
      inverseMass + dot(direction, cross(inverseInertiaWorld(vehicle, cross(arm, direction)), arm));
    normalImpulse = -(1 + restitution) * normalSpeed / inverseEffectiveMass(normal);
    const sliding = sub(velocity, mul(normal, normalSpeed));
    const slipSpeed = length(sliding);
    let impulse = mul(normal, normalImpulse);
    if (slipSpeed > 1e-4) {
      const tangent = mul(sliding, 1 / slipSpeed);
      const frictionImpulse = Math.min(friction * normalImpulse, slipSpeed / inverseEffectiveMass(tangent));
      impulse = sub(impulse, mul(tangent, frictionImpulse));
    }
    vehicle.vel = add(vehicle.vel, mul(impulse, inverseMass));
    vehicle.angvel = add(vehicle.angvel, inverseInertiaWorld(vehicle, cross(arm, impulse)));
  }
  vehicle.pos = add(vehicle.pos, mul(normal, penetration * 0.8));
  return normalImpulse;
}

export function resolveBarriers(vehicle: Vehicle, track: Track, runoff = track.data.runoffWidth) {
  let maxPen = 0, impact = 0;
  for (const local of barrierPoints) {
    const point = add(vehicle.pos, qRot(vehicle.q, local));
    const p = track.project(point[0], point[2]);
    if (!p) continue;
    const penetration = Math.abs(p.d) - (p.hw + runoff);
    if (penetration <= 0) continue;
    maxPen = Math.max(maxPen, penetration);
    const normal = mul(track.leftAt(p), -sign(p.d));
    impact = Math.max(impact, applyContact(vehicle, point, normal, penetration, 0.2, 0.4));
  }
  return { maxPen, impact };
}

export function resolveBodyGround(vehicle: Vehicle, ground: GroundFn): void {
  for (const local of bodyPoints) {
    const point = add(vehicle.pos, qRot(vehicle.q, local));
    const { height, normal } = ground(point[0], point[2]);
    const penetration = height - point[1];
    if (penetration > 0) applyContact(vehicle, point, normal, penetration, 0.1, 0.6);
  }
}
