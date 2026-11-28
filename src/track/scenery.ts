import * as THREE from 'three';
import { hash2 } from '@/math/noise';
import { mulberry32 } from '@/math/rng';
import { smoothstep } from '@/math/scalar';
import { QUALITY, type Quality } from '@/render/quality';
import { nearestSample } from './terrain';
import type { AssetManager } from '@/assets/assetManager';
import { makeTreeModel, TreeCluster } from './trees';
import type { Track } from './track';

type Kind = 'trees' | 'rocks';
interface Candidate { x: number; y: number; z: number; fromBarrier: number; model: string }

function candidates(track: Track, heightAt: (x: number, z: number) => number, kind: Kind) {
  const { seed } = track.data.scenery;
  const cfg = track.data.scenery[kind];
  const baseDensity = kind === 'trees' ? { valley: .85, coast: .45 }[track.data.id] : cfg.density;
  const rng = mulberry32(seed + (kind === 'trees' ? 0 : 7777));
  const xs = track.pos.map(p => p[0]), zs = track.pos.map(p => p[2]);
  const size = track.data.terrain.size;
  const xLow = Math.min(...xs), xHigh = Math.max(...xs), zLow = Math.min(...zs), zHigh = Math.max(...zs);
  const xMin = (xLow + xHigh - size) / 2, zMin = (zLow + zHigh - size) / 2;
  const reach = cfg.maxFromBarrier + Math.max(...track.hw) + track.data.runoffWidth;
  const sea = track.data.environment.sea;
  const result: Candidate[] = [];
  for (let gx = xMin; gx < xMin + size; gx += cfg.spacing) {
    for (let gz = zMin; gz < zMin + size; gz += cfg.spacing) {
      const x = gx + (rng() - 0.5) * cfg.spacing * 0.9;
      const z = gz + (rng() - 0.5) * cfg.spacing * 0.9;
      const r = rng();
      // All cells consume the same random values. Only points within reach can survive the distance test.
      if (r >= baseDensity || x < xLow - reach || x > xHigh + reach || z < zLow - reach || z > zHigh + reach) continue;
      const { index, distance } = nearestSample(track, x, z);
      const fromBarrier = distance - track.barrierOffset(index);
      if (fromBarrier < cfg.minFromBarrier || fromBarrier > cfg.maxFromBarrier) continue;
      const density = baseDensity * (1 - 0.6 * smoothstep(cfg.minFromBarrier, cfg.maxFromBarrier, fromBarrier));
      if (r >= density) continue;
      const ground = heightAt(x, z);
      if (sea && ground < sea.level + 1) continue;
      const variant = hash2(Math.round(x * 10), Math.round(z * 10), seed);
      result.push({ x, y: ground - (kind === 'trees' ? 0.3 : 0.2), z, fromBarrier,
        model: cfg.models[Math.floor(variant * cfg.models.length)] });
    }
  }
  return result.sort((a, b) => a.fromBarrier - b.fromBarrier);
}

function placements(items: Candidate[], center: THREE.Vector3, seed: number) {
  const matrices = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 16), 16);
  const pose = new THREE.Object3D();
  items.forEach(({ x, y, z }, i) => {
    pose.position.set(x, y, z).sub(center);
    pose.rotation.y = hash2(Math.round(x), Math.round(z), seed + 1) * 2 * Math.PI;
    pose.scale.setScalar(0.8 + 0.4 * hash2(Math.round(x), Math.round(z), seed + 2));
    pose.updateMatrix();
    pose.matrix.toArray(matrices.array, i * 16);
  });
  return matrices;
}

type MeshMaterial = THREE.Material | THREE.Material[];
interface Part { geometry: THREE.BufferGeometry; material: MeshMaterial }

function instance(name: string, part: Part, matrices: THREE.InstancedBufferAttribute, castShadow: boolean) {
  const mesh = new THREE.InstancedMesh(part.geometry, part.material, 0);
  mesh.name = name;
  mesh.instanceMatrix = matrices;
  mesh.count = matrices.count;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  mesh.updateMatrix();
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function modelParts(model: THREE.Group, tree: boolean) {
  const parts: Part[] = [];
  model.updateMatrixWorld(true);
  model.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
      if (tree && mat instanceof THREE.MeshStandardMaterial) {
        mat.emissive.setHex(0);
        mat.emissiveMap = null;
      }
      if (tree && (mat.alphaTest > 0 || mat.userData.gltfAlphaMode === 'MASK')) {
        mat.alphaToCoverage = false;
        mat.side = THREE.DoubleSide;
      }
    }
    // Bake the authored hierarchy once so every part shares the exact same instance matrices.
    const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
    if (node.matrixWorld.determinant() < 0) {
      if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i));
      const index = geometry.getIndex()!;
      for (let i = 0; i < index.count; i += 3) {
        const second = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, second);
      }
    }
    parts.push({ geometry, material: node.material });
  });
  return parts;
}

function treeCells(items: Candidate[]) {
  const cells = new Map<string, Candidate[]>();
  // 规格未指定：按 96 米分区，让镜头只绘制可见林地，并按分区切换远景树。
  for (const tree of items) {
    const key = Math.floor(tree.x / 96) + ',' + Math.floor(tree.z / 96);
    const cell = cells.get(key);
    if (cell) cell.push(tree);
    else cells.set(key, [tree]);
  }
  return cells.values();
}

function treeLod(name: string, model: ReturnType<typeof makeTreeModel>, matrices: THREE.InstancedBufferAttribute, quality: Quality) {
  const shadows = QUALITY[quality].treeShadows;
  const near = instance(name, { geometry: model.canopy, material: model.solid }, matrices, shadows);
  const far = instance(name + '-distant', { geometry: model.distant, material: model.leaves }, matrices, shadows);
  const proxy = instance(name + '-proxy', { geometry: model.proxy, material: model.plain }, matrices, shadows);
  far.visible = proxy.visible = false;
  const cluster = new TreeCluster(model, proxy);
  cluster.addLevel(near, 0);
  cluster.addLevel(far, quality === 'low' ? 85 : 125, .10);
  return cluster;
}

async function buildVariant(name: string, items: Candidate[], trees: boolean, seed: number, quality: Quality, assets: AssetManager) {
  const group = new THREE.Group();
  const model = await assets.loadScenery(name);
  const parts = model ? modelParts(model, trees) : [];
  let fallback: ReturnType<typeof makeTreeModel> | undefined;
  if (!model && trees) {
    const [sprays, card] = await Promise.all([
      assets.loadTexture('scenery/tree_sprays.png', true), assets.loadTexture('scenery/' + name + '.png', true),
    ]);
    fallback = makeTreeModel(name, sprays, card);
  } else if (!model) {
    parts.push({ geometry: new THREE.IcosahedronGeometry(1.2, 0).scale(1, .6, 1).translate(0, .45, 0),
      material: new THREE.MeshStandardMaterial({ color: '#7A7A72' }) });
  }
  for (const batch of trees ? treeCells(items) : [items]) {
    const center = new THREE.Vector3();
    if (trees) {
      for (const item of batch) { center.x += item.x; center.y += item.y; center.z += item.z; }
      center.divideScalar(batch.length);
    }
    const matrices = placements(batch, center, seed);
    const cell = fallback ? treeLod(name, fallback, matrices, quality) : new THREE.Group();
    if (!fallback) {
      for (const part of parts) cell.add(instance(name, part, matrices, trees && QUALITY[quality].treeShadows));
    }
    cell.position.copy(center);
    cell.updateMatrix();
    cell.matrixAutoUpdate = false;
    group.add(cell);
  }
  return group;
}

export async function placeScenery(track: Track, heightAt: (x: number, z: number) => number,
  quality: Quality, assets: AssetManager) {
  const group = new THREE.Group();
  group.name = 'scenery';
  const seed = track.data.scenery.seed;
  const tasks: Promise<THREE.Group>[] = [];
  for (const kind of ['trees', 'rocks'] as const) {
    const trees = kind === 'trees';
    const items = candidates(track, heightAt, kind).slice(0, trees ? QUALITY[quality].maxTrees : QUALITY[quality].maxRocks);
    if (trees) console.info('[scenery] trees', items.length);
    for (const name of track.data.scenery[kind].models) {
      const variant = items.filter(p => p.model === name);
      if (variant.length) tasks.push(buildVariant(name, variant, trees, seed, quality, assets));
    }
  }
  for (const variant of await Promise.all(tasks)) group.add(variant);
  return group;
}
