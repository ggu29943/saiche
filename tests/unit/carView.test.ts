import { expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Box3, Color, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { EMPTY_MANIFEST } from '@/assets/manifest';
import { CARS } from '@/data';
import { Vehicle } from '@/physics/vehicle';
import { CarView } from '@/render/carView';
import { buildPlaceholderCar } from '@/render/placeholderCar';

const cfg = CARS.hatch;
const manifest = { ...EMPTY_MANIFEST, cars: { hatch: { model: 'custom/hatch.glb' } } };
const assets = (model: Group | null) => ({
  loadManifest: async () => manifest,
  loadGLB: vi.fn(async () => model),
});

test('loads the manifest model, prepares all materials, and updates paint and lamps per car', async () => {
  const model = buildPlaceholderCar(cfg);
  const tail = new Mesh(undefined, new MeshStandardMaterial({ name: 'light_tail' }));
  model.getObjectByName('body')!.add(tail);
  const coastModel = model.clone();
  const loader = assets(model);
  const view = await CarView.load(cfg, 'valley', loader);
  const coast = await CarView.load(cfg, 'coast', assets(coastModel));
  expect(loader.loadGLB).toHaveBeenCalledWith('custom/hatch.glb');
  expect(view.source).toBe('glb');
  expect(view.modelOffset.children[0]).toBe(model);
  expect(cfg.wheels.map(w => model.getObjectByName('wheel_' + w.id)?.name))
    .toEqual(['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR']);
  const material = (group: Group, name: string) => (group.getObjectByName(name) as Mesh).material as MeshStandardMaterial;
  expect(material(model, 'body')).toBeInstanceOf(MeshPhysicalMaterial);
  expect(view.paint).toMatchObject({ metalness: .05, roughness: .35, clearcoat: 1, clearcoatRoughness: .06 });
  view.setPaint(2);
  expect(material(model, 'body')).toBe(view.paint);
  expect(view.paint.color.equals(new Color(cfg.visual.paints[2]))).toBe(true);
  view.setPaint(99);
  expect(view.selectedPaint).toBe(2);
  expect(coast.selectedPaint).toBe(0);
  expect(coast.paint.color.equals(new Color(cfg.visual.paints[0]))).toBe(true);
  expect(material(model, 'cabin')).toMatchObject({ name: 'glass', transparent: true, opacity: 0.45 });
  expect(material(model, 'head_L').emissiveIntensity).toBe(0.3);
  expect(material(coastModel, 'head_L').emissiveIntensity).toBe(2);
  expect(tail.material.emissiveIntensity).toBe(0.8);
  const wheels = new Vehicle(cfg).wheels;
  view.update({ pos: [0, 0, 0], q: [1, 0, 0, 0] }, wheels, 1, 0.06);
  expect(material(model, 'brake_L').emissiveIntensity).toBe(4);
  expect(material(coastModel, 'brake_L').emissiveIntensity).toBe(0.4);
  view.update({ pos: [0, 0, 0], q: [1, 0, 0, 0] }, wheels, 1, 0.05);
  expect(material(model, 'brake_L').emissiveIntensity).toBe(0.4);
});

test('wheel centres follow suspension and rotations preserve the loaded rest orientation', () => {
  const model = buildPlaceholderCar(cfg);
  const front = model.getObjectByName('wheel_FL')!;
  const rest = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.25);
  front.quaternion.copy(rest);
  const caliper = new Group();
  caliper.name = 'caliper_FL';
  model.add(caliper);
  const view = new CarView(cfg, model);
  const wheels = new Vehicle(cfg).wheels;
  Object.assign(wheels[0], { lenPrev: 0.12, len: 0.22, steer: 0.3, rot: Math.PI / 2 });
  view.update({ pos: [0, cfg.cgHeight, 0], q: [1, 0, 0, 0] }, wheels, 0.5);
  const [x, y, z] = cfg.wheels[0].mount;
  const center = front.getWorldPosition(new Vector3());
  expect(center.x).toBeCloseTo(x);
  expect(center.y).toBeCloseTo(y - 0.17 + cfg.cgHeight);
  expect(center.z).toBeCloseTo(z);
  const steer = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3);
  const spin = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2);
  expect(front.quaternion.angleTo(steer.clone().multiply(spin).multiply(rest))).toBeCloseTo(0);
  expect(caliper.quaternion.angleTo(steer)).toBeCloseTo(0);
  expect(caliper.position.equals(front.position)).toBe(true);
});

test('a missing or incomplete GLB uses the same animated placeholder hierarchy', async () => {
  for (const unavailable of [null, new Group()]) {
    const car = await CarView.load(cfg, 'valley', assets(unavailable));
    expect(car.source).toBe('placeholder');
    expect(car.carRoot.getObjectByName('body')).toBeInstanceOf(Mesh);
    expect(car.carRoot.getObjectByName('wheel_RR')).toBeDefined();
  }
});

test.each([
  ['hatch', 4.263189, 1.121, 1.425],
  ['rally', 4.658799, 1.134, 1.238],
  ['coupe', 4.443928, 1.032, 1.150],
] as const)('the packed %s keeps its glazing, length and measured hood mount', async (id, length, y, z) => {
  const bytes = await readFile(`public/assets/cars/${id}/${id}.glb`);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(new Uint8Array(bytes).buffer, '');
  expect(gltf.parser.json.extensionsRequired).toContain('EXT_meshopt_compression');
  const bounds = new Box3().setFromObject(gltf.scene, true);
  expect(bounds.max.z - bounds.min.z).toBeCloseTo(length, 4);
  for (const pane of ['windscreen', 'rear_windscreen', 'door_glass_L', 'door_glass_R', 'quarter_glass_L', 'quarter_glass_R']) {
    const window = gltf.scene.getObjectByName('body_' + pane) as Mesh;
    expect(window.geometry.getAttribute('position').count).toBeGreaterThan(2);
    expect(window.material).toMatchObject({ name: 'glass' });
  }
  const view = new CarView(CARS[id], gltf.scene);
  expect(view.hoodMount.y).toBeCloseTo(y, 3);
  expect(view.hoodMount.z).toBeCloseTo(z, 3);
});
