import { PHYSICS_DT } from '@/config/constants';
import { qFromYaw, qRot, type Q } from '@/math/quat';
import { add, sub, mul, dot, cross, norm, type V3 } from '@/math/vec3';
import { flatGround } from './surfaces';
import { mfPeakX } from './tyre';
import type { CarConfig, DriveInput, GroundFn, VehicleState, WheelState } from './types';

export class Vehicle implements VehicleState {
  readonly kp: number;
  readonly ap: number;
  pos: V3 = [0, 0, 0];
  q: Q = [1, 0, 0, 0];
  vel: V3 = [0, 0, 0];
  angvel: V3 = [0, 0, 0];
  wheels: WheelState[] = [];
  gear = 1;
  shiftTimer = 0;
  sinceShift = 10;
  revTimer = 0;
  rpm = 0;
  limiterCut = false;
  tcsScale = 1;
  time = 0;

  constructor(readonly cfg: CarConfig, readonly ground: GroundFn = flatGround) {
    const { lon, lat } = cfg.tire;
    this.kp = mfPeakX(lon.B, lon.C, lon.E);
    this.ap = mfPeakX(lat.B, lat.C, lat.E);
    this.reset([0, 0, 0], 0);
  }

  reset(groundPos: V3, yaw: number): void {
    this.pos = [groundPos[0], groundPos[1] + this.cfg.cgHeight + 0.02, groundPos[2]];
    this.q = qFromYaw(yaw);
    this.vel = [0, 0, 0];
    this.angvel = [0, 0, 0];
    this.wheels = this.cfg.wheels.map(({ axle }) => {
      const { restLength } = this.cfg.suspension[axle];
      return {
        omega: 0, kappa: 0, beta: 0, len: restLength, lenPrev: restLength, contact: false,
        Fz: 0, Fx: 0, Fy: 0, steer: 0, rot: 0, surface: 'asphalt', absScale: 1,
        contactPoint: [0, 0, 0], normal: [0, 0, 0], f: [0, 0, 0], l: [0, 0, 0],
        r: [0, 0, 0], vx: 0, vy: 0,
      };
    });
    this.gear = 1;
    this.shiftTimer = this.revTimer = this.time = 0;
    this.sinceShift = 10;
    this.rpm = this.cfg.engine.idleRpm;
    this.limiterCut = false;
    this.tcsScale = 1;
  }

  totalRatio(gear: number): number {
    if (gear === 0) return 0;
    const gb = this.cfg.gearbox;
    return (gear < 0 ? -gb.reverse : gb.ratios[gear - 1]) * gb.final;
  }

  driven(): number[] {
    return { FWD: [0, 1], RWD: [2, 3], AWD: [0, 1, 2, 3] }[this.cfg.drivetrain.type];
  }

  speedKmh(): number {
    return dot(this.vel, qRot(this.q, [0, 0, 1])) * 3.6;
  }

  step(inp: DriveInput, dt = PHYSICS_DT): void {
    const c = this.cfg, q = this.q;
    const up = qRot(q, [0, 1, 0]), fwd = qRot(q, [0, 0, 1]), left = qRot(q, [1, 0, 0]);

    // 1. Ackermann steering.
    const delta = inp.steer * (c.steering.maxAngleDeg * Math.PI / 180);
    const wheelbase = c.wheels[0].mount[2] - c.wheels[2].mount[2];
    const trackWidth = c.wheels[0].mount[0] - c.wheels[1].mount[0];
    let dl = 0, dr = 0;
    if (Math.abs(delta) > 1e-4) {
      const radius = wheelbase / Math.tan(Math.abs(delta));
      const inner = Math.atan(wheelbase / (radius - trackWidth / 2));
      const outer = Math.atan(wheelbase / (radius + trackWidth / 2));
      [dl, dr] = delta > 0 ? [inner, outer] : [-outer, -inner];
    }
    this.wheels[0].steer = dl;
    this.wheels[1].steer = dr;
    this.wheels[2].steer = this.wheels[3].steer = 0;

    // 2. Suspension ray projected onto the local ground plane.
    for (const [i, w] of this.wheels.entries()) {
      const wc = c.wheels[i], s = c.suspension[wc.axle];
      const mount = add(this.pos, qRot(q, wc.mount));
      const hit = this.ground(mount[0], mount[2]);
      const down = mul(up, -1);
      const denom = dot(down, hit.normal);
      w.lenPrev = w.len;
      w.contact = false;
      w.Fz = 0;
      if (denom < -0.2) {
        const groundPoint: V3 = [mount[0], hit.height, mount[2]];
        const t = dot(sub(groundPoint, mount), hit.normal) / denom;
        if (t <= s.restLength + c.wheel.radius) {
          w.contact = true;
          const springLength = t - c.wheel.radius;
          const minLen = s.restLength - s.maxCompression;
          const bump = springLength < minLen ? c.suspension.bumpStopStiffness * (minLen - springLength) : 0;
          w.len = Math.max(springLength, minLen);
          const compression = s.restLength - w.len;
          const compressionSpeed = (w.lenPrev - w.len) / dt;
          const damp = compressionSpeed > 0 ? s.damperBump : s.damperRebound;
          w.Fz = Math.max(0, s.stiffness * compression + damp * compressionSpeed + bump);
          w.contactPoint = add(mount, mul(down, t));
          w.normal = hit.normal;
          w.surface = hit.surface;
        }
      }
      if (!w.contact) w.len = Math.min(w.len + 2 * dt, s.restLength);
    }

    // 3. Anti-roll bars.
    for (const [iL, iR, axle] of [[0, 1, 'front'], [2, 3, 'rear']] as const) {
      const wL = this.wheels[iL], wR = this.wheels[iR];
      if (wL.contact && wR.contact) {
        const s = c.suspension[axle];
        const diff = (s.restLength - wL.len) - (s.restLength - wR.len);
        const force = s.antiRollStiffness * diff;
        wL.Fz = Math.max(0, wL.Fz + force);
        wR.Fz = Math.max(0, wR.Fz - force);
      }
    }

    // 4. Longitudinal and lateral velocities in the contact frame.
    const speed = dot(this.vel, fwd);
    for (const w of this.wheels) {
      if (!w.contact) continue;
      const n = w.normal;
      const heading = add(mul(fwd, Math.cos(w.steer)), mul(left, Math.sin(w.steer)));
      w.f = norm(sub(heading, mul(n, dot(heading, n))));
      w.l = cross(n, w.f);
      w.r = sub(w.contactPoint, this.pos);
      const velocity = add(this.vel, cross(this.angvel, w.r));
      w.vx = dot(velocity, w.f);
      w.vy = dot(velocity, w.l);
    }
    // TODO T10
    // TODO T11
  }
}
