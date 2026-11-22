import { GRAVITY } from '@/config/constants';
import { qRot } from '@/math/quat';
import { dot } from '@/math/vec3';
import type { Vehicle } from '@/physics/vehicle';

export function steeringAssist(
  steer: number,
  vehicle: Pick<Vehicle, 'cfg' | 'vel' | 'q' | 'ap'>,
  enabled: boolean,
): number {
  if (!enabled) return steer;

  const forward = qRot(vehicle.q, [0, 0, 1]);
  const speed = Math.max(Math.abs(dot(vehicle.vel, forward)), 1);
  const wheelbase = vehicle.cfg.wheels[0].mount[2] - vehicle.cfg.wheels[2].mount[2];
  const maxAngle = vehicle.cfg.steering.maxAngleDeg * Math.PI / 180;
  const limit = Math.min(maxAngle, Math.atan(wheelbase * GRAVITY * 0.95 / (speed * speed)) + 0.8 * vehicle.ap);
  return steer * (limit / maxAngle);
}
