import { AIR_DENSITY, GRAVITY, PHYSICS_DT } from '@/config/constants';
import { qFromYaw, qInvRot, qMul, qNorm, qRot, type Q } from '@/math/quat';
import { add, sub, mul, dot, cross, norm, type V3 } from '@/math/vec3';
import { clamp, pmod, sign } from '@/math/scalar';
import { torqueCurve, diffSplit } from './engine';
import { flatGround, SURFACES } from './surfaces';
import { mfPeakX, tyreForces } from './tyre';
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
    // 5. Gearbox, engine and traction control.
    const { engine, gearbox, drivetrain } = c;
    const assists = inp.assists;
    this.sinceShift += dt;
    if (this.shiftTimer > 0) this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    const driven = this.driven();
    const drivenOmega = driven.reduce((sum, i) => sum + this.wheels[i].omega, 0) / driven.length;
    let { throttle, brake } = inp;
    if (assists.autoGear) {
      if (this.gear > 0 && speed < 0.5 && brake > 0.5 && throttle < 0.05) {
        this.revTimer += dt;
        if (this.revTimer > 0.3) {
          this.gear = -1;
          this.revTimer = 0;
        }
      } else if (this.gear < 0 && speed > -0.5 && throttle > 0.5 && brake < 0.05) {
        this.revTimer += dt;
        if (this.revTimer > 0.3) {
          this.gear = 1;
          this.revTimer = 0;
        }
      } else {
        this.revTimer = 0;
      }
      if (this.gear < 0) [throttle, brake] = [inp.brake, inp.throttle];
    }
    const ratio = this.totalRatio(this.gear);
    const wheelRpm = Math.abs(drivenOmega * ratio) * 60 / (2 * Math.PI);
    this.rpm = Math.min(Math.max(wheelRpm, engine.idleRpm + throttle * (engine.launchRpm - engine.idleRpm)), engine.limiterRpm + 200);
    if (assists.autoGear && this.gear > 0 && this.shiftTimer === 0 && this.sinceShift >= gearbox.minShiftInterval) {
      if (wheelRpm > gearbox.autoUpRpm && this.gear < gearbox.ratios.length) {
        this.gear++;
        this.shiftTimer = gearbox.shiftTime;
        this.sinceShift = 0;
      } else if (wheelRpm < gearbox.autoDownRpm && this.gear > 1) {
        this.gear--;
        this.shiftTimer = gearbox.shiftTime;
        this.sinceShift = 0;
      }
    }
    if (!assists.autoGear && inp.shift !== 0 && this.shiftTimer === 0) {
      let next = clamp(this.gear + inp.shift, -1, gearbox.ratios.length);
      if (next < 0 && speed > 2) next = 0;
      if (next !== this.gear) {
        this.gear = next;
        this.shiftTimer = gearbox.shiftTime;
        this.sinceShift = 0;
      }
    }
    if (this.rpm >= engine.limiterRpm) this.limiterCut = true;
    else if (this.rpm < engine.limiterRpm - 200) this.limiterCut = false;
    if (assists.tcs) {
      const maxSlip = Math.max(...driven.map(i => this.wheels[i].kappa));
      this.tcsScale = maxSlip > 1.2 * this.kp ? Math.max(0.2, this.tcsScale - 6 * dt) : Math.min(1, this.tcsScale + 2 * dt);
    } else {
      this.tcsScale = 1;
    }
    const effectiveThrottle = this.limiterCut ? 0 : throttle * this.tcsScale;
    const engineTorque = effectiveThrottle * torqueCurve(engine.torqueCurve, this.rpm)
      - (1 - effectiveThrottle) * engine.engineBrakeNmPer1000Rpm * this.rpm / 1000;
    const engaged = this.shiftTimer === 0 && this.gear !== 0;
    let axleTorque = engaged ? engineTorque * ratio * gearbox.efficiency : 0;
    if (wheelRpm < engine.idleRpm && effectiveThrottle < 0.01) axleTorque = 0;
    const reflectedInertia = engaged ? engine.inertia * ratio * ratio / driven.length : 0;

    // 6. Torque distribution at the centre and axle differentials.
    const driveTorque = [0, 0, 0, 0];
    const [fl, fr, rl, rr] = this.wheels;
    if (drivetrain.type === 'FWD') {
      [driveTorque[0], driveTorque[1]] = diffSplit(axleTorque, fl.omega, fr.omega, drivetrain.diffFront);
    } else if (drivetrain.type === 'RWD') {
      [driveTorque[2], driveTorque[3]] = diffSplit(axleTorque, rl.omega, rr.omega, drivetrain.diffRear);
    } else {
      const wf = 0.5 * (fl.omega + fr.omega), wr = 0.5 * (rl.omega + rr.omega);
      let front = axleTorque * drivetrain.frontSplit, rear = axleTorque * (1 - drivetrain.frontSplit);
      const dc = drivetrain.diffCenter;
      if (dc.type === 'lsd') {
        const limit = dc.preloadNm + dc.lockRatio * Math.abs(axleTorque);
        const transfer = clamp(dc.lockGain * (wr - wf), -limit, limit);
        front += 0.5 * transfer;
        rear -= 0.5 * transfer;
      }
      [driveTorque[0], driveTorque[1]] = diffSplit(front, fl.omega, fr.omega, drivetrain.diffFront);
      [driveTorque[2], driveTorque[3]] = diffSplit(rear, rl.omega, rr.omega, drivetrain.diffRear);
    }

    // 7. Brakes, ABS and stability control.
    const frontBrake = brake * c.brakes.maxTorque * c.brakes.frontBias / 2;
    const rearBrake = brake * c.brakes.maxTorque * (1 - c.brakes.frontBias) / 2;
    const brakeTorque = [frontBrake, frontBrake, rearBrake, rearBrake];
    const handBrake = inp.handbrake * c.brakes.handbrakeTorque / 2;
    brakeTorque[2] += handBrake;
    brakeTorque[3] += handBrake;
    for (const [i, w] of this.wheels.entries()) {
      if (assists.abs && brake > 0 && w.contact) {
        if (w.kappa < -this.kp) w.absScale = Math.max(0.1, w.absScale - 12 * dt);
        else if (w.kappa > -0.7 * this.kp) w.absScale = Math.min(1, w.absScale + 4 * dt);
      } else {
        w.absScale = 1;
      }
      if (!(i >= 2 && inp.handbrake > 0)) brakeTorque[i] *= w.absScale;
    }
    if (assists.esc && speed > 5) {
      const yawRate = dot(this.angvel, up);
      const target = speed * delta / (wheelbase * (1 + 0.0025 * speed * speed));
      const error = yawRate - target;
      if (Math.abs(error) > 0.12 && Math.abs(yawRate) > Math.abs(target)) {
        brakeTorque[yawRate > 0 ? 1 : 0] += Math.min(1500, 4000 * (Math.abs(error) - 0.12));
        this.tcsScale = Math.min(this.tcsScale, 0.6);
      }
    }
    // 8. Relaxation of contact patch slip, tyre forces, and wheel spin.
    const { radius } = c.wheel, tire = c.tire;
    let totalForce: V3 = [0, -c.mass * GRAVITY, 0];
    let totalTorque: V3 = [0, 0, 0];
    for (const [i, w] of this.wheels.entries()) {
      const wheelInertia = c.wheel.inertia + (driven.includes(i) ? reflectedInertia : 0);
      let freeTorque: number;
      if (w.contact) {
        const { vx, vy } = w;
        w.kappa = (w.kappa + dt * (w.omega * radius - vx) / tire.relaxLon) / (1 + dt * Math.abs(vx) / tire.relaxLon);
        w.beta = (w.beta + dt * (-vy) / tire.relaxLat) / (1 + dt * Math.abs(vx) / tire.relaxLat);
        w.kappa = clamp(w.kappa, -1.5, 1.5);
        w.beta = clamp(w.beta, -1.5, 1.5);
        const material = SURFACES[w.surface];
        [w.Fx, w.Fy] = tyreForces(w.kappa, Math.atan(w.beta), w.Fz, tire, material.mu, this.kp, this.ap);
        const rolling = (tire.rollingResistance + material.rolling) * w.Fz;
        freeTorque = driveTorque[i] - w.Fx * radius - rolling * radius * sign(w.omega);
        let force = add(add(mul(up, w.Fz), mul(w.f, w.Fx)), mul(w.l, w.Fy));
        force = add(force, mul(w.f, -rolling * clamp(vx / 0.5, -1, 1)));
        totalForce = add(totalForce, force);
        totalTorque = add(totalTorque, cross(w.r, force));
      } else {
        w.kappa = w.beta = w.Fx = w.Fy = 0;
        freeTorque = driveTorque[i];
      }
      let omega = w.omega + dt * freeTorque / wheelInertia;
      const maxBrake = brakeTorque[i] * dt / wheelInertia;
      if (Math.abs(omega) <= maxBrake) omega = 0;
      else omega -= sign(omega) * maxBrake;
      w.omega = clamp(omega, -400, 400);
      w.rot = pmod(w.rot + w.omega * dt, 2 * Math.PI);
    }

    // 9. Drag and front/rear downforce.
    const v2 = dot(this.vel, this.vel);
    if (v2 > 1e-6) totalForce = add(totalForce, mul(norm(this.vel), -0.5 * AIR_DENSITY * c.aero.cdA * v2));
    const vf = Math.max(0, speed);
    const frontDown = 0.5 * AIR_DENSITY * c.aero.clAFront * vf * vf;
    const rearDown = 0.5 * AIR_DENSITY * c.aero.clARear * vf * vf;
    const pf = qRot(q, [0, 0, c.wheels[0].mount[2]]);
    const pr = qRot(q, [0, 0, c.wheels[2].mount[2]]);
    for (const [point, downforce] of [[pf, frontDown], [pr, rearDown]] as const) {
      const force = mul(up, -downforce);
      totalForce = add(totalForce, force);
      totalTorque = add(totalTorque, cross(point, force));
    }

    // 10. Semi-implicit Euler; resolve the gyroscopic term in body space.
    this.vel = add(this.vel, mul(totalForce, dt / c.mass));
    const I = c.inertia;
    let wb = qInvRot(q, this.angvel);
    const tb = qInvRot(q, totalTorque);
    const gyro = cross(wb, [I.x * wb[0], I.y * wb[1], I.z * wb[2]]);
    wb = [wb[0] + dt * (tb[0] - gyro[0]) / I.x,
      wb[1] + dt * (tb[1] - gyro[1]) / I.y,
      wb[2] + dt * (tb[2] - gyro[2]) / I.z];
    this.angvel = qRot(q, wb);
    this.pos = add(this.pos, mul(this.vel, dt));
    const dq = qMul([0, ...this.angvel], q);
    this.q = qNorm([q[0] + 0.5 * dt * dq[0], q[1] + 0.5 * dt * dq[1],
      q[2] + 0.5 * dt * dq[2], q[3] + 0.5 * dt * dq[3]]);
    this.time += dt;
  }
}
