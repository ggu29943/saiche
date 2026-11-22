import * as THREE from 'three';
import { hash2 } from '@/math/noise';
import { mulberry32 } from '@/math/rng';
import { smoothstep } from '@/math/scalar';
import type { Quality } from '@/render/materials';
import { nearestSample } from './terrain';
import type { Track } from './track';

type Kind = 'trees' | 'rocks';
interface Candidate { x: number; y: number; z: number; fromBarrier: number; model: string }
const limits = {
  trees: { low: 800, medium: 2500, high: 6000 },
  rocks: { low: 150, medium: 400, high: 800 },
};

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

function placeholderParts(kind: Kind) {
  if (kind === 'trees') {
    return [
      { geometry: new THREE.ConeGeometry(2.2, 7, 7).translate(0, 5.5, 0),
        material: new THREE.MeshStandardMaterial({ color: '#2F4F2F' }) },
      { geometry: new THREE.CylinderGeometry(0.25, 0.3, 2, 6).translate(0, 1, 0),
        material: new THREE.MeshStandardMaterial({ color: '#4B3621' }) },
    ];
  }
  return [{ geometry: new THREE.IcosahedronGeometry(1.2, 0).scale(1, 0.6, 1).translate(0, 0.45, 0),
    material: new THREE.MeshStandardMaterial({ color: '#7A7A72' }) }];
}

export function placeScenery(track: Track, heightAt: (x: number, z: number) => number,
  quality: Quality, _assets: null) {
  const group = new THREE.Group();
  group.name = 'scenery';
  const seed = track.data.scenery.seed;
  const instance = new THREE.Object3D();
  for (const kind of ['trees', 'rocks'] as const) {
    const items = candidates(track, heightAt, kind).slice(0, limits[kind][quality]);
    if (kind === 'trees') console.info('[scenery] trees', items.length);
    for (const model of track.data.scenery[kind].models) {
      const variant = items.filter(p => p.model === model);
      if (!variant.length) continue;
      const meshes = placeholderParts(kind).map(({ geometry, material }) =>
        new THREE.InstancedMesh(geometry, material, variant.length));
      variant.forEach(({ x, y, z }, i) => {
        instance.position.set(x, y, z);
        instance.rotation.y = hash2(Math.round(x), Math.round(z), seed + 1) * 2 * Math.PI;
        instance.scale.setScalar(0.8 + 0.4 * hash2(Math.round(x), Math.round(z), seed + 2));
        instance.updateMatrix();
        for (const mesh of meshes) mesh.setMatrixAt(i, instance.matrix);
      });
      for (const mesh of meshes) {
        mesh.name = model;
        mesh.castShadow = kind === 'trees' && quality !== 'low';
        mesh.receiveShadow = true;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.updateMatrix();
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
      }
    }
  }
  return group;
}
