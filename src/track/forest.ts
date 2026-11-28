import { hash2, valueNoise } from '@/math/noise';
import { clamp, smoothstep } from '@/math/scalar';
import { QUALITY, type Quality } from '@/render/quality';
import { nearestSample } from './terrain';
import type { Track } from './track';
import { treeSize } from './trees';

export interface TreePoint {
  x: number; y: number; z: number; model: string; scale: number;
  sunFloor?: [number, number, number];
}
type HeightAt = (x: number, z: number) => number;
export function forestBounds(track: Track) {
  const xs = track.pos.map(p => p[0]), zs = track.pos.map(p => p[2]), size = track.data.terrain.size;
  return { x: (Math.min(...xs) + Math.max(...xs) - size) / 2,
    z: (Math.min(...zs) + Math.max(...zs) - size) / 2, size };
}

export function distantTrees(track: Track, heightAt: HeightAt, quality: Quality) {
  const { x: x0, z: z0, size } = forestBounds(track);
  const { seed, trees } = track.data.scenery;
  const sea = track.data.environment.sea;
  const limit = QUALITY[quality].maxForestTrees;
  const points: (TreePoint & { rank: number })[] = [];
  // 规格未指定：16 米抖动网格，大片林地内再叠加较小的林隙。各档位从同一组地点取样。
  const spacing = 16;
  for (let i = 0; i < size / spacing; i++) for (let j = 0; j < size / spacing; j++) {
    const x = x0 + (i + .04 + .92 * hash2(i, j, seed + 91)) * spacing;
    const z = z0 + (j + .04 + .92 * hash2(i, j, seed + 92)) * spacing;
    const grove = .72 * valueNoise(x / 138, z / 138, seed + 93) + .28 * valueNoise(x / 49, z / 49, seed + 94);
    const density = sea ? .75 * smoothstep(-.30, .48, grove) : .78 * smoothstep(-.43, .32, grove);
    const roll = hash2(i, j, seed + 95);
    if (roll >= density * limit / QUALITY.high.maxForestTrees) continue;
    const y = heightAt(x, z);
    if (sea && y < sea.level + 3.5) continue;
    const { index, distance } = nearestSample(track, x, z);
    if (distance - track.barrierOffset(index) < trees.maxFromBarrier) continue;
    const slope = Math.hypot(heightAt(x + 5, z) - heightAt(x - 5, z), heightAt(x, z + 5) - heightAt(x, z - 5)) / 10;
    if (slope > .70) continue;
    const model = trees.models[Math.floor(hash2(i, j, seed + 96) * trees.models.length)];
    points.push({ x, y: y - .3, z, model, scale: 1, rank: roll / density });
  }
  return points.length > limit ? points.sort((a, b) => a.rank - b.rank).slice(0, limit) : points;
}

// Sweep from the sun downwind. Each one-metre strip stores the highest crown silhouette
// seen along that ray. Sample it BEFORE adding the current crown, so it cannot shadow itself.
export function bakeCanopyShadows(trees: TreePoint[], track: Track, heightAt: HeightAt) {
  const [sx, sy, sz] = track.data.environment.sunDirection;
  const horizontal = Math.hypot(sx, sz), dx = sx / horizontal, dz = sz / horizontal, rise = sy / horizontal;
  const along = (p: TreePoint) => p.x * dx + p.z * dz;
  const bounds = forestBounds(track);
  const corners = [bounds.x, bounds.x + bounds.size].flatMap(x => [bounds.z, bounds.z + bounds.size].map(z => x * dz - z * dx));
  const origin = Math.floor(Math.min(...corners)) - 16;
  const canopy = new Float32Array(Math.ceil(Math.max(...corners)) - origin + 16).fill(-Infinity);
  const far = track.data.terrain.farField;
  const top = Math.max(far.type === 'hills' ? far.base + far.amplitude : far.maxHeight! + far.amplitude,
    ...track.pos.map(p => p[1])) + 2;
  const step = bounds.size / QUALITY.high.terrainSegments / 2;
  for (const p of [...trees].sort((a, b) => along(b) - along(a))) {
    const distance = along(p), across = p.x * dz - p.z * dx - origin;
    const size = treeSize(p.model), height = size.height * p.scale, radius = height * size.aspect / 2;
    const floor = (offset: number) => {
      let blocked = canopy[Math.round(across + offset)] + distance * rise;
      const x0 = p.x + offset * dz, z0 = p.z - offset * dx;
      // The upper bound includes both track elevations and the far-field noise amplitude.
      for (let d = step; p.y + d * rise < top; d += step) {
        const x = x0 + d * dx, z = z0 + d * dz;
        if (x < bounds.x || z < bounds.z || x > bounds.x + bounds.size || z > bounds.z + bounds.size) break;
        blocked = Math.max(blocked, heightAt(x, z) - d * rise);
      }
      return clamp((blocked - p.y) / height, -1, 2);
    };
    p.sunFloor = [floor(-radius * .78), floor(0), floor(radius * .78)];
    for (let k = Math.ceil(across - radius); k <= across + radius; k++) {
      const taper = Math.abs(k - across) / radius;
      const silhouette = p.y + height * (1 - .74 * taper) - distance * rise;
      canopy[k] = Math.max(canopy[k], silhouette);
    }
  }
}
