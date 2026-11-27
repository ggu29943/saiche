import { Box3, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, Raycaster, Vector3, type Scene, type Material } from 'three';
import { lerp } from '@/math/scalar';
import type { V3 } from '@/math/vec3';
import type { Q } from '@/math/quat';
import type { CarConfig, WheelState } from '@/physics/types';
import type { AssetManager } from '@/assets/assetManager';
import type { TrackData } from '@/track/types';
import { buildPlaceholderCar } from './placeholderCar';

const up = new Vector3(0, 1, 0);
const axle = new Vector3(1, 0, 0);

// Measure in the authored ground frame before the CG offset or suspension pose is applied.
function measureHoodMount(model: Group) {
  model.updateMatrixWorld(true);
  const windscreens = new Box3();
  const panels: Mesh[] = [];
  const frontGlass = model.getObjectByName('body_windscreen');
  model.traverse(node => {
    if (!(node instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
    if (materials.some(m => m.name === 'paint')) panels.push(node);
    if (!frontGlass && materials.some(m => m.name === 'glass')) windscreens.expandByObject(node, true);
  });
  if (frontGlass) windscreens.setFromObject(frontGlass, true);
  // Unlabelled third-party or empty models still get a finite mount.
  const bounds = windscreens.isEmpty() ? new Box3().setFromObject(model) : windscreens;
  if (bounds.isEmpty()) return new Vector3(0, 1.18, .95);
  const z = (windscreens.isEmpty() ? bounds.getCenter(new Vector3()).z : windscreens.max.z) + .2;
  const ray = new Raycaster(new Vector3(0, bounds.max.y + 1, z), new Vector3(0, -1, 0));
  const hit = ray.intersectObjects(panels, false)[0];
  return new Vector3(0, (hit?.point.y ?? bounds.max.y) + .25, z);
}

export class CarView {
  readonly carRoot = new Group();
  readonly modelOffset = new Group();
  readonly paint: MeshPhysicalMaterial;
  readonly hoodMount: Vector3;
  readonly source: 'glb' | 'placeholder';
  private paintIndex = 0;
  private readonly brakeLights = new Set<MeshStandardMaterial>();
  private readonly nodes;
  private readonly steer = new Quaternion();
  private readonly spin = new Quaternion();

  static async load(cfg: CarConfig, trackId: TrackData['id'], assets: Pick<AssetManager, 'loadManifest' | 'loadGLB'>) {
    const manifest = await assets.loadManifest();
    const path = manifest.cars[cfg.id]?.model;
    const model = await assets.loadGLB(path);
    if (model && model.getObjectByName('body') && cfg.wheels.every(w => model.getObjectByName('wheel_' + w.id))) {
      return new CarView(cfg, model, trackId);
    }
    if (model) console.info('[assets] invalid car nodes', path);
    return new CarView(cfg, undefined, trackId);
  }

  constructor(readonly cfg: CarConfig, loadedModel?: Group, trackId: TrackData['id'] = 'valley') {
    const model = loadedModel ?? buildPlaceholderCar(cfg);
    this.hoodMount = measureHoodMount(model);
    this.source = loadedModel ? 'glb' : 'placeholder';
    this.carRoot.name = 'carRoot';
    this.modelOffset.name = 'modelOffset';
    this.modelOffset.position.set(0, -cfg.cgHeight, (cfg.wheels[0].mount[2] + cfg.wheels[2].mount[2]) / 2);
    this.carRoot.add(this.modelOffset);
    this.modelOffset.add(model);
    this.paint = new MeshPhysicalMaterial({
      name: 'paint', color: cfg.visual.paints[0], metalness: 0.05, roughness: 0.35,
      clearcoat: 1, clearcoatRoughness: 0.06,
    });
    const glass = new MeshPhysicalMaterial({
      name: 'glass', color: '#0A0C10', metalness: 0, roughness: 0.05,
      transparent: true, opacity: 0.45, envMapIntensity: 1.5,
    });
    const lamps = new Map<Material, MeshStandardMaterial>();
    const prepareMaterial = (material: Material): Material => {
      if (material.name === 'paint') return this.paint;
      if (material.name === 'glass') return glass;
      if (!(material instanceof MeshStandardMaterial)) return material;
      const cached = lamps.get(material);
      if (cached) return cached;
      if (!['light_brake', 'light_head', 'light_tail'].includes(material.name)) return material;
      // Clone only lights, whose settings belong to this car and its environment.
      const lamp = material.clone();
      lamps.set(material, lamp);
      switch (lamp.name) {
        case 'light_brake':
          lamp.emissive.set('#FF1A1A');
          lamp.emissiveIntensity = 0.4;
          this.brakeLights.add(lamp);
          break;
        case 'light_head':
          lamp.emissive.set('#FFF4E0');
          lamp.emissiveIntensity = trackId === 'coast' ? 2 : 0.3;
          break;
        case 'light_tail':
          lamp.emissive.set('#B00000');
          lamp.emissiveIntensity = 0.8;
          break;
      }
      return lamp;
    };
    model.traverse(node => {
      if (!(node instanceof Mesh)) return;
      node.material = Array.isArray(node.material) ? node.material.map(prepareMaterial) : prepareMaterial(node.material);
      node.castShadow = node.receiveShadow = true;
    });
    this.nodes = cfg.wheels.map(({ id }) => {
      const wheel = model.getObjectByName('wheel_' + id);
      if (!wheel) throw new Error('Missing wheel_' + id);
      const caliper = model.getObjectByName('caliper_' + id);
      return { wheel, rest: wheel.quaternion.clone(), caliper, caliperRest: caliper?.quaternion.clone() };
    });
  }

  setPaintEnvironment(scene: Scene) {
    // A sky-only reflection probe otherwise illuminates the lower body like open sky.
    this.paint.envMap = scene.environment;
    this.paint.envMapRotation.copy(scene.environmentRotation);
    this.paint.envMapIntensity = .30 * scene.environmentIntensity;
  }

  get selectedPaint() { return this.paintIndex; }

  setPaint(index: number) {
    if (!Number.isInteger(index) || !this.cfg.visual.paints[index]) return;
    this.paint.color.set(this.cfg.visual.paints[index]);
    this.paintIndex = index;
  }

  update(pose: { pos: V3; q: Q }, wheels: WheelState[], alpha: number, brake = 0) {
    for (const lamp of this.brakeLights) lamp.emissiveIntensity = brake > 0.05 ? 4 : 0.4;
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
