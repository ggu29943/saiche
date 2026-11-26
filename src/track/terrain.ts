import { Mesh, PlaneGeometry } from 'three';
import { fbm } from '@/math/noise';
import { clamp, lerp, pmod, smoothstep } from '@/math/scalar';
import { QUALITY, type Quality } from '@/render/quality';
import type { TrackMaterials } from '@/render/materials';
import { DRAIN_SLOPE, Track } from './track';

export function nearestSample(track: Track, x: number, z: number) {
  let best = Infinity;
  let index = 0;
  for (let i = 0; i < track.count; i += 4) {
    const p = track.pos[i];
    const d2 = (p[0] - x) ** 2 + (p[2] - z) ** 2;
    if (d2 < best) {
      best = d2;
      index = i;
    }
  }
  const coarse = index;
  for (let offset = -4; offset <= 4; offset++) {
    const i = pmod(coarse + offset, track.count);
    const p = track.pos[i];
    const d2 = (p[0] - x) ** 2 + (p[2] - z) ** 2;
    if (d2 < best) {
      best = d2;
      index = i;
    }
  }
  return { index, distance: Math.sqrt(best) };
}

function terrainHeight(track: Track, x: number, z: number) {
  const { index, distance } = nearestSample(track, x, z);
  const terrain = track.data.terrain;
  const hw = track.hw[index];
  const edge = hw + track.data.runoffWidth + terrain.vergeWidth;
  const edgeY = track.pos[index][1] - terrain.vergeDrop - Math.max(0, edge - hw) * DRAIN_SLOPE;
  if (distance <= edge) return edgeY - 0.6;

  const f = terrain.farField;
  const noise = fbm(x * f.frequency, z * f.frequency, f.octaves, track.data.scenery.seed);
  const farY = f.type === 'hills'
    ? f.base + f.amplitude * (0.5 + 0.5 * noise)
    : clamp((z - f.coastZ!) * f.coastSlope!, f.minHeight!, f.maxHeight!) + f.amplitude * noise;
  return lerp(edgeY - 0.2, farY, smoothstep(edge, edge + terrain.blendDistance, distance));
}

export function buildTerrain(track: Track, quality: Quality, mats: Pick<TrackMaterials, 'terrain'>) {
  const n = QUALITY[quality].terrainSegments;
  const size = track.data.terrain.size;
  const xs = track.pos.map(p => p[0]), zs = track.pos.map(p => p[2]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const geometry = new PlaneGeometry(size, size, n, n);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(cx, 0, cz);
  const vertices = geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) {
    vertices.setY(i, terrainHeight(track, vertices.getX(i), vertices.getZ(i)));
  }
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, mats.terrain);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  function heightAt(x: number, z: number) {
    const u = clamp((x - cx + size / 2) * n / size, 0, n);
    const v = clamp((z - cz + size / 2) * n / size, 0, n);
    const ix = Math.min(Math.floor(u), n - 1), iz = Math.min(Math.floor(v), n - 1);
    const a = iz * (n + 1) + ix, b = a + n + 1;
    const lower = lerp(vertices.getY(a), vertices.getY(a + 1), u - ix);
    const upper = lerp(vertices.getY(b), vertices.getY(b + 1), u - ix);
    return lerp(lower, upper, v - iz);
  }
  return { mesh, heightAt };
}
