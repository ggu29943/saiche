import { MAX_STEPS_PER_FRAME, PHYSICS_DT } from '@/config/constants';
import { qNorm, type Q } from '@/math/quat';
import { lerp } from '@/math/scalar';
import type { V3 } from '@/math/vec3';
import type { DriveInput } from './types';
import type { Vehicle } from './vehicle';

interface Pose { pos: V3; q: Q }

export class PhysicsWorld {
  prev: Pose;
  accumulator = 0;
  lastImpact = 0;

  constructor(readonly vehicle: Vehicle,
    readonly resolveCollisions?: (vehicle: Vehicle) => { impact: number },
    readonly resolveBodyGround?: (vehicle: Vehicle) => void,
  ) {
    this.prev = { pos: [...vehicle.pos], q: [...vehicle.q] };
  }

  advance(frameDt: number, getInput: () => DriveInput, afterStep: (dt: number) => void): number {
    this.lastImpact = 0;
    this.accumulator += Math.min(frameDt, 0.1);
    let steps = 0;
    while (this.accumulator >= PHYSICS_DT && steps < MAX_STEPS_PER_FRAME) {
      this.prev = { pos: [...this.vehicle.pos], q: [...this.vehicle.q] };
      this.vehicle.step(getInput(), PHYSICS_DT);
      if (this.resolveCollisions) {
        const { impact } = this.resolveCollisions(this.vehicle);
        this.lastImpact = Math.max(this.lastImpact, impact);
      }
      this.resolveBodyGround?.(this.vehicle);
      afterStep(PHYSICS_DT);
      this.accumulator -= PHYSICS_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;
    return steps;
  }

  interpolated(): Pose {
    const alpha = this.accumulator / PHYSICS_DT;
    const { pos, q } = this.prev;
    const target = this.vehicle;
    const sign = q.reduce((sum, v, i) => sum + v * target.q[i], 0) < 0 ? -1 : 1;
    return {
      pos: pos.map((v, i) => lerp(v, target.pos[i], alpha)) as V3,
      q: qNorm(q.map((v, i) => lerp(v, sign * target.q[i], alpha)) as Q),
    };
  }
}
