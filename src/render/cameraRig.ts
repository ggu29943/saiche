import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { clamp, expDecay, lerp } from '@/math/scalar';
import type { Vehicle } from '@/physics/vehicle';
import type { CarView } from './carView';
import type { Track } from '@/track/track';

const modes = ['chase', 'chaseFar', 'hood', 'bumper'] as const;
export type CameraMode = typeof modes[number];
const chaseParameters = {
  chase: { distance: 5.6, height: 1.75, lookAhead: 2, lookHeight: 0.9, fov: 62, speedFov: 10 },
  chaseFar: { distance: 7.6, height: 2.40, lookAhead: 2.5, lookHeight: 1.0, fov: 58, speedFov: 8 },
};
const mounts = {
  hatch: { hood: [1.22, 0.35], bumper: [0.55, 2.20] },
  coupe: { hood: [1.12, 0.45], bumper: [0.50, 2.25] },
  rally: { hood: [1.25, 0.35], bumper: [0.58, 2.20] },
};
const up = new Vector3(0, 1, 0);
const cameraFacing = new Quaternion().setFromAxisAngle(up, Math.PI);

export class CameraRig {
  mode: CameraMode = 'chase';
  private snap = true;
  private readonly forward = new Vector3();
  private readonly smoothed = new Vector3();
  private readonly target = new Vector3();

  constructor(private readonly camera: PerspectiveCamera, private readonly track: Track,
    private readonly heightAt: (x: number, z: number) => number) {}

  cycle() {
    this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    this.reset();
  }

  reset() { this.snap = true; }

  update(dt: number, car: CarView, vehicle: Vehicle) {
    const { position, quaternion } = car.carRoot;
    const camera = this.camera;
    this.forward.set(0, 0, 1).applyQuaternion(quaternion);
    const yaw = Math.atan2(this.forward.x, this.forward.z);
    let fov: number;
    if (this.mode === 'hood' || this.mode === 'bumper') {
      const [height, z] = mounts[vehicle.cfg.id][this.mode];
      camera.position.set(0, height, z).add(car.modelOffset.position).applyQuaternion(quaternion).add(position);
      camera.quaternion.setFromAxisAngle(up, yaw).slerp(quaternion, 0.5).multiply(cameraFacing);
      fov = 72;
    } else {
      const view = chaseParameters[this.mode];
      const speed = vehicle.speedKmh();
      this.forward.set(Math.sin(yaw), 0, Math.cos(yaw));
      if (Math.hypot(...vehicle.vel) > 3 && speed / 3.6 < -1) this.forward.negate();
      if (this.snap) this.smoothed.copy(this.forward);
      else this.smoothed.lerp(this.forward, expDecay(6, dt)).normalize();
      this.target.copy(position).addScaledVector(this.smoothed, -view.distance);
      this.target.y += view.height;
      camera.position.lerp(this.target, this.snap ? 1 : expDecay(12, dt));
      const { x, z } = camera.position;
      camera.position.y = Math.max(camera.position.y, this.heightAt(x, z) + 0.4,
        (this.track.height(x, z) ?? -Infinity) + 0.4);
      this.target.copy(position).addScaledVector(this.smoothed, view.lookAhead);
      this.target.y += view.lookHeight;
      camera.lookAt(this.target);
      fov = view.fov + view.speedFov * clamp(speed / 300, 0, 1);
      if (!this.snap) fov = lerp(camera.fov, fov, expDecay(4, dt));
    }
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    this.snap = false;
  }
}
