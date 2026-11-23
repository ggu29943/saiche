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
import type { Quality } from '@/render/materials';
import type { CarView } from '@/render/carView';
import { RaceRenderer } from '@/render/renderer';
import { buildTrackScene } from '@/render/trackScene';
import type { Track } from '@/track/track';
import { DEFAULT_SETTINGS } from './settings';

export type DriveOverride = Pick<DriveInput, 'steer' | 'throttle' | 'brake' | 'handbrake'>;

export class DriveScene {
  readonly vehicle: Vehicle;
  readonly world: PhysicsWorld;
  readonly camera: CameraRig;
  readonly display: RaceRenderer;
  private readonly scene;
  private readonly input = new InputManager();
  private readonly smoothing = new InputSmoothing();
  private readonly shifts: (-1 | 1)[] = [];
  override: DriveOverride | null = null;
  progressS: number;
  lapInvalid = false;
  private brake = 0;
  private elapsedSteps = 0;
  private upsideDownSteps = 0;
  private nextResetStep = 0;

  constructor(root: HTMLElement, readonly track: Track, readonly car: CarView, quality?: Quality) {
    this.display = new RaceRenderer(root, quality, true);
    const { scene, heightAt } = buildTrackScene(track, this.display.quality);
    this.scene = scene;
    this.vehicle = new Vehicle(car.cfg, track.query);
    this.progressS = track.data.startS - track.data.spawnBehindStart;
    resetToTrack(this.vehicle, track, this.progressS);
    this.world = new PhysicsWorld(this.vehicle,
      vehicle => resolveBarriers(vehicle, track),
      vehicle => resolveBodyGround(vehicle, track.query));
    scene.add(this.car.carRoot);
    this.camera = new CameraRig(this.display.camera, track, heightAt);
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

  draw(dt: number) {
    this.input.poll();
    for (const event of this.input.consumeEvents()) {
      if (event === 'reset') this.recover();
      if (event === 'camera') this.camera.cycle();
      if (event === 'shiftUp') this.shifts.push(1);
      if (event === 'shiftDown') this.shifts.push(-1);
    }
    this.world.advance(dt, this.physicsInput, this.afterStep);
    const pose = this.world.interpolated();
    this.car.update(pose, this.vehicle.wheels, this.world.accumulator / PHYSICS_DT, this.brake);
    this.camera.update(dt, this.car, this.vehicle);
    this.display.draw(this.scene);
  }
}
