import { PHYSICS_DT } from '@/config/constants';
import { InputManager } from '@/input/inputManager';
import { InputSmoothing } from '@/input/smoothing';
import { steeringAssist } from '@/input/steeringAssist';
import { resolveBarriers, resolveBodyGround } from '@/physics/collision';
import { resetToTrack } from '@/physics/reset';
import type { CarConfig, DriveInput } from '@/physics/types';
import { Vehicle } from '@/physics/vehicle';
import { PhysicsWorld } from '@/physics/world';
import { CameraRig } from '@/render/cameraRig';
import type { Quality } from '@/render/materials';
import { CarView } from '@/render/carView';
import { RaceRenderer } from '@/render/renderer';
import { buildTrackScene } from '@/render/trackScene';
import type { Track } from '@/track/track';
import { DEFAULT_SETTINGS } from './settings';

export type DriveOverride = Pick<DriveInput, 'steer' | 'throttle' | 'brake' | 'handbrake'>;

export class DriveScene {
  readonly vehicle: Vehicle;
  readonly world: PhysicsWorld;
  readonly car: CarView;
  readonly camera: CameraRig;
  readonly display: RaceRenderer;
  private readonly scene;
  private readonly input = new InputManager();
  private readonly smoothing = new InputSmoothing();
  private readonly shifts: (-1 | 1)[] = [];
  override: DriveOverride | null = null;
  progressS: number;

  constructor(root: HTMLElement, readonly track: Track, cfg: CarConfig, quality?: Quality) {
    this.display = new RaceRenderer(root, quality, true);
    const { scene, heightAt } = buildTrackScene(track, this.display.quality);
    this.scene = scene;
    this.vehicle = new Vehicle(cfg, track.query);
    this.progressS = track.data.startS - track.data.spawnBehindStart;
    resetToTrack(this.vehicle, track, this.progressS);
    this.world = new PhysicsWorld(this.vehicle,
      vehicle => resolveBarriers(vehicle, track),
      vehicle => resolveBodyGround(vehicle, track.query));
    this.car = new CarView(cfg);
    scene.add(this.car.carRoot);
    this.camera = new CameraRig(this.display.camera, track, heightAt);
  }

  private physicsInput = (): DriveInput => {
    const intent = this.input.intent();
    const controls = this.override ?? this.smoothing.step(intent, PHYSICS_DT);
    return {
      ...controls,
      steer: steeringAssist(controls.steer, this.vehicle, DEFAULT_SETTINGS.steeringAssist[intent.device]),
      shift: this.shifts.shift() ?? 0,
      assists: DEFAULT_SETTINGS.assists,
    };
  };

  draw(dt: number) {
    this.input.poll();
    for (const event of this.input.consumeEvents()) {
      if (event === 'camera') this.camera.cycle();
      if (event === 'shiftUp') this.shifts.push(1);
      if (event === 'shiftDown') this.shifts.push(-1);
    }
    this.world.advance(dt, this.physicsInput, () => {});
    const pose = this.world.interpolated();
    this.car.update(pose, this.vehicle.wheels, this.world.accumulator / PHYSICS_DT);
    const [x, , z] = this.vehicle.pos;
    this.progressS = this.track.project(x, z)?.s ?? this.progressS;
    this.camera.update(dt, this.car, this.vehicle);
    this.display.draw(this.scene);
  }
}
