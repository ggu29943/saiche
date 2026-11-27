import { qRot } from '@/math/quat';
import { AUTO_RESET_UPSIDE_DOWN_S, PHYSICS_DT, RESET_COOLDOWN_S } from '@/config/constants';
import { InputManager } from '@/input/inputManager';
import { InputSmoothing } from '@/input/smoothing';
import { steeringAssist } from '@/input/steeringAssist';
import { resolveBarriers, resolveBodyGround } from '@/physics/collision';
import { resetToTrack } from '@/physics/reset';
import type { DriveInput } from '@/physics/types';
import { Vehicle } from '@/physics/vehicle';
import { PhysicsWorld } from '@/physics/world';
import { CameraRig } from '@/render/cameraRig';
import type { CarView } from '@/render/carView';
import { RaceRenderer } from '@/render/renderer';
import type { TrackScene } from '@/render/trackScene';
import type { Track } from '@/track/track';
import { DEFAULT_SETTINGS } from './settings';

export type DriveOverride = Pick<DriveInput, 'steer' | 'throttle' | 'brake' | 'handbrake'>;

export class DriveScene {
  readonly vehicle: Vehicle;
  readonly world: PhysicsWorld;
  readonly camera: CameraRig;
  private readonly input = new InputManager();
  private readonly smoothing = new InputSmoothing();
  private readonly shifts: (-1 | 1)[] = [];
  override: DriveOverride | null = null;
  progressS: number;
  lapInvalid = false;
  private brake = 0;
  private elapsedSteps = 0;
  private physicsTime = performance.now();
  private physicsTimer?: number;
  private pendingSteps = 0;
  private upsideDownSteps = 0;
  private nextResetStep = 0;

  constructor(readonly display: RaceRenderer, readonly track: Track, readonly car: CarView,
    private readonly level: TrackScene) {
    const { heightAt } = level;
    this.vehicle = new Vehicle(car.cfg, track.query);
    this.progressS = track.data.startS - track.data.spawnBehindStart;
    resetToTrack(this.vehicle, track, this.progressS);
    this.world = new PhysicsWorld(this.vehicle,
      vehicle => resolveBarriers(vehicle, track),
      vehicle => resolveBodyGround(vehicle, track.query));
    this.camera = new CameraRig(this.display.camera, track, heightAt);
    if (display.software) {
      // 规格未指定：软件 WebGL 等待整帧光栅化时，浏览器可以暂停 RAF；输入与固定物理步继续计时。
      this.physicsTimer = window.setInterval(() => { this.pendingSteps += this.advanceToNow(); }, 1000 / 60);
    }
  }

  setQuality(quality: RaceRenderer['quality']) {
    this.level.setQuality(quality);
    this.display.setQuality(quality);
  }

  dispose() {
    window.clearInterval(this.physicsTimer);
    this.input.dispose();
    this.level.dispose();
  }

  private physicsInput = (): DriveInput => {
    const intent = this.input.intent();
    const controls = this.override ?? this.smoothing.step(intent, PHYSICS_DT);
    this.brake = controls.brake;
    return {
      ...controls,
      steer: steeringAssist(controls.steer, this.vehicle, DEFAULT_SETTINGS.steeringAssist[intent.device]),
      shift: this.shifts.shift() ?? 0,
      assists: DEFAULT_SETTINGS.assists,
    };
  };

  private recover() {
    if (this.elapsedSteps < this.nextResetStep) return;
    resetToTrack(this.vehicle, this.track, this.progressS);
    this.world.prev = { pos: [...this.vehicle.pos], q: [...this.vehicle.q] };
    this.camera.reset();
    this.shifts.length = 0;
    this.lapInvalid = true;
    this.upsideDownSteps = 0;
    this.nextResetStep = this.elapsedSteps + Math.round(RESET_COOLDOWN_S / PHYSICS_DT);
  }

  private afterStep = () => {
    this.elapsedSteps++;
    const [x, , z] = this.vehicle.pos;
    this.progressS = this.track.project(x, z)?.s ?? this.progressS;
    const up = qRot(this.vehicle.q, [0, 1, 0]);
    this.upsideDownSteps = up[1] < 0.3 ? this.upsideDownSteps + 1 : 0;
    if (this.upsideDownSteps * PHYSICS_DT >= AUTO_RESET_UPSIDE_DOWN_S) this.recover();
  };

  private advanceToNow() {
    const now = performance.now();
    const dt = (now - this.physicsTime) / 1000;
    this.physicsTime = now;
    return document.hidden ? 0 : this.advance(dt);
  }

  private advance(dt: number) {
    this.input.poll();
    for (const event of this.input.consumeEvents()) {
      if (event === 'reset') this.recover();
      if (event === 'camera') this.camera.cycle();
      if (event === 'shiftUp') this.shifts.push(1);
      if (event === 'shiftDown') this.shifts.push(-1);
    }
    return this.world.advance(dt, this.physicsInput, this.afterStep);
  }

  draw(dt: number) {
    const steps = this.physicsTimer === undefined ? this.advance(dt) : this.pendingSteps + this.advanceToNow();
    this.pendingSteps = 0;
    const pose = this.world.interpolated();
    this.car.update(pose, this.vehicle.wheels, this.world.accumulator / PHYSICS_DT, this.brake);
    this.camera.update(dt, this.car, this.vehicle);
    this.level.environment.update(this.car.carRoot.position, this.display.camera.position);
    this.level.water?.update(dt);
    this.display.draw(dt);
    return steps;
  }
}
