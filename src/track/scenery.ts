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
  const rng = mulberry32(seed + (kind === 'trees' ? 0 : 7777));
  const xs = track.pos.map(p => p[0]), zs = track.pos.map(p => p[2]);
  const size = track.data.terrain.size;
  const xMin = (Math.min(...xs) + Math.max(...xs) - size) / 2;
  const zMin = (Math.min(...zs) + Math.max(...zs) - size) / 2;
  const sea = track.data.environment.sea;
  const result: Candidate[] = [];
  for (let gx = xMin; gx < xMin + size; gx += cfg.spacing) {
    for (let gz = zMin; gz < zMin + size; gz += cfg.spacing) {
      const x = gx + (rng() - 0.5) * cfg.spacing * 0.9;
      const z = gz + (rng() - 0.5) * cfg.spacing * 0.9;
      const r = rng();
      const { index, distance } = nearestSample(track, x, z);
      const fromBarrier = distance - track.barrierOffset(index);
      if (fromBarrier < cfg.minFromBarrier || fromBarrier > cfg.maxFromBarrier) continue;
      const density = cfg.density * (1 - 0.6 * smoothstep(cfg.minFromBarrier, cfg.maxFromBarrier, fromBarrier));
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

function instances(name: string, items: Candidate[], seed: number, geometry: THREE.BufferGeometry,
  material: THREE.Material, center: THREE.Vector3, castShadow: boolean) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const pose = new THREE.Object3D();
  items.forEach(({x,y,z}, i) => {
    pose.position.set(x,y,z).sub(center);
    pose.rotation.y = hash2(Math.round(x), Math.round(z), seed + 1) * 2 * Math.PI;
    pose.scale.setScalar(0.8 + 0.4 * hash2(Math.round(x), Math.round(z), seed + 2));
    pose.updateMatrix();
    mesh.setMatrixAt(i,pose.matrix);
  });
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.matrixAutoUpdate = false;
  return mesh;
}

function addTrees(group: THREE.Group, name: string, items: Candidate[], seed: number, quality: Quality,
  model: ReturnType<typeof makeTreeModel>) {
  const cells = new Map<string,Candidate[]>();
  // 规格未指定：按 96 米分区，让镜头只绘制可见林地，并按分区切换远景树。
  const cellSize = 96;
  for (const tree of items) {
    const key = Math.floor(tree.x/cellSize) + ',' + Math.floor(tree.z/cellSize);
    const cell = cells.get(key);
    if (cell) cell.push(tree);
    else cells.set(key,[tree]);
  }
  for (const batch of cells.values()) {
    const center = new THREE.Vector3();
    for (const tree of batch) {
      center.x += tree.x;
      center.y += tree.y;
      center.z += tree.z;
    }
    center.divideScalar(batch.length);
    const near = instances(name,batch,seed,model.canopy,model.solid,center,QUALITY[quality].treeShadows);
    const otherLevel = (geometry: THREE.BufferGeometry, material: THREE.Material, suffix: string) => {
      const mesh = new THREE.InstancedMesh(geometry,material,0);
      mesh.name = name + suffix;
      mesh.instanceMatrix = near.instanceMatrix;
      mesh.count = near.count;
      mesh.computeBoundingSphere();
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = QUALITY[quality].treeShadows;
      mesh.receiveShadow = true;
      mesh.visible = false;
      return mesh;
    };
    const far = otherLevel(model.distant,model.leaves,'-distant');
    const proxy = otherLevel(model.proxy,model.plain,'-proxy');
    const cluster = new TreeCluster(model,proxy);
    cluster.position.copy(center);
    cluster.updateMatrix();
    cluster.matrixAutoUpdate = false;
    cluster.addLevel(near,0);
    cluster.addLevel(far,quality === 'low' ? 85 : 125,0.10);
    group.add(cluster);
  }
}

export async function placeScenery(track: Track, heightAt: (x: number, z: number) => number,
  quality: Quality, assets: AssetManager) {
  const group = new THREE.Group();
  group.name = 'scenery';
  const seed = track.data.scenery.seed;
  const treeIds = track.data.scenery.trees.models;
  const [atlas, billboards] = await Promise.all([
    assets.loadTexture('scenery/tree_sprays.png', true),
    Promise.all(treeIds.map(async id => [id, await assets.loadTexture('scenery/' + id + '.png', true)] as const)),
  ]);
  const cards = new Map(billboards);
  for (const kind of ['trees', 'rocks'] as const) {
    const items = candidates(track, heightAt, kind).slice(0, kind === 'trees' ? QUALITY[quality].maxTrees : QUALITY[quality].maxRocks);
    if (kind === 'trees') console.info('[scenery] trees', items.length);
    for (const name of track.data.scenery[kind].models) {
      const variant = items.filter(p => p.model === name);
      if (!variant.length) continue;
      if (kind === 'trees') {
        addTrees(group,name,variant,seed,quality,makeTreeModel(name, atlas, cards.get(name) ?? null));
      } else {
        const rock = new THREE.IcosahedronGeometry(1.2,0).scale(1,0.6,1).translate(0,0.45,0);
        const material = new THREE.MeshStandardMaterial({color:'#7A7A72'});
        group.add(instances(name,variant,seed,rock,material,new THREE.Vector3(),false));
      }
    }
  }
  return group;
}
