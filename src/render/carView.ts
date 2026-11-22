import { Group, Mesh, MeshPhysicalMaterial, Quaternion, Vector3, type Material } from 'three';
import { lerp } from '@/math/scalar';
import type { V3 } from '@/math/vec3';
import type { Q } from '@/math/quat';
import type { CarConfig, WheelState } from '@/physics/types';
import { buildPlaceholderCar } from './placeholderCar';

const up = new Vector3(0, 1, 0);
const axle = new Vector3(1, 0, 0);

export class CarView {
  readonly carRoot = new Group();
  readonly modelOffset = new Group();
  readonly paint: MeshPhysicalMaterial;
  private readonly nodes;
  private readonly steer = new Quaternion();
  private readonly spin = new Quaternion();

  constructor(readonly cfg: CarConfig, model = buildPlaceholderCar(cfg)) {
    this.carRoot.name = 'carRoot';
    this.modelOffset.name = 'modelOffset';
    this.modelOffset.position.set(0, -cfg.cgHeight, (cfg.wheels[0].mount[2] + cfg.wheels[2].mount[2]) / 2);
    this.carRoot.add(this.modelOffset);
    this.modelOffset.add(model);
    this.paint = new MeshPhysicalMaterial({
      name: 'paint', color: cfg.visual.paints[0], metalness: 0.35, roughness: 0.28,
      clearcoat: 1, clearcoatRoughness: 0.04,
    });
    const replacePaint = (material: Material) => material.name === 'paint' ? this.paint : material;
    model.traverse(node => {
      if (!(node instanceof Mesh)) return;
      node.material = Array.isArray(node.material) ? node.material.map(replacePaint) : replacePaint(node.material);
      node.castShadow = node.receiveShadow = true;
    });
    this.nodes = cfg.wheels.map(({ id }) => {
      const wheel = model.getObjectByName('wheel_' + id);
      if (!wheel) throw new Error('Missing wheel_' + id);
      const caliper = model.getObjectByName('caliper_' + id);
      return { wheel, rest: wheel.quaternion.clone(), caliper, caliperRest: caliper?.quaternion.clone() };
    });
  }

  update(pose: { pos: V3; q: Q }, wheels: WheelState[], alpha: number) {
    this.carRoot.position.fromArray(pose.pos);
    const [w, x, y, z] = pose.q;
    this.carRoot.quaternion.set(x, y, z, w);
    for (let i = 0; i < wheels.length; i++) {
      const state = wheels[i];
      const { mount } = this.cfg.wheels[i];
      const { wheel, rest, caliper, caliperRest } = this.nodes[i];
      const length = lerp(state.lenPrev, state.len, alpha);
      wheel.position.set(mount[0], mount[1] - length + this.cfg.cgHeight, mount[2] - this.modelOffset.position.z);
      this.steer.setFromAxisAngle(up, state.steer);
      this.spin.setFromAxisAngle(axle, state.rot);
      wheel.quaternion.copy(this.steer).multiply(this.spin).multiply(rest);
      if (caliper && caliperRest) {
        caliper.position.copy(wheel.position);
        caliper.quaternion.copy(this.steer).multiply(caliperRest);
      }
    }
  }
}
