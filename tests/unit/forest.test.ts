import { describe, expect, test } from 'vitest';
import { MeshStandardMaterial } from 'three';
import { TRACKS } from '@/data';
import { bakeCanopyShadows, distantTrees, forestBounds, type TreePoint } from '@/track/forest';
import { buildTerrain, nearestSample } from '@/track/terrain';
import { Track } from '@/track/track';
import { QUALITY } from '@/render/quality';

describe('distant forest', () => {
  test.each(['valley', 'coast'] as const)('%s scatters across the terrain outside the roadside band', id => {
    const track = new Track(TRACKS[id]);
    const { heightAt } = buildTerrain(track, 'medium', { terrain: new MeshStandardMaterial() });
    const { x, z, size } = forestBounds(track);
    const high = distantTrees(track, heightAt, 'high');
    const medium = distantTrees(track, heightAt, 'medium');
    const low = distantTrees(track, heightAt, 'low');
    const key = (p: TreePoint) => p.x + ',' + p.z;
    const highKeys = new Set(high.map(key)), mediumKeys = new Set(medium.map(key));
    expect(low.every(p => mediumKeys.has(key(p))) && medium.every(p => highKeys.has(key(p)))).toBe(true);
    expect([low.length, medium.length, high.length].every((n, i) => n > 0 && n <= [2000, 6000, 12000][i])).toBe(true);
    expect(high.length).toBeGreaterThan(medium.length);
    const occupied = new Set<number>();
    for (const p of high) {
      const { index, distance } = nearestSample(track, p.x, p.z);
      if (distance - track.barrierOffset(index) < track.data.scenery.trees.maxFromBarrier ||
          p.x < x || p.x >= x + size || p.z < z || p.z >= z + size ||
          (id === 'coast' && heightAt(p.x, p.z) < 3.5)) throw new Error('Invalid forest site ' + key(p));
      occupied.add(Math.floor((p.x - x) / size * 4) + 4 * Math.floor((p.z - z) / size * 4));
    }
    expect(occupied.size).toBeGreaterThanOrEqual(10);
    expect(QUALITY.medium.maxTrees).toBe(4000);
    expect(QUALITY.medium.maxForestTrees).toBe(6000);
  });

  test('rejects cliffs and low beaches', () => {
    const track = new Track(TRACKS.coast);
    expect(distantTrees(track, () => 2, 'high')).toHaveLength(0);
    expect(distantTrees(track, x => 6000 + x, 'high')).toHaveLength(0);
  });

  test('the sunward ridge and neighbouring crowns block transmission, an isolated tree does not shadow itself', () => {
    const track = new Track(TRACKS.coast), [sx, , sz] = track.data.environment.sunDirection;
    const norm = Math.hypot(sx, sz), dx = sx / norm, dz = sz / norm;
    const point = (along: number, across = 0): TreePoint =>
      ({ x: along * dx + across * dz, y: 0, z: along * dz - across * dx, model: 'tree_a' });
    const lee = point(0), caster = point(8), clear = point(0, 12);
    bakeCanopyShadows([lee, caster, clear], track, () => 0);
    expect(lee.sunFloor![1]).toBeGreaterThan(.55);
    expect(caster.sunFloor![1]).toBeLessThan(.1);
    expect(clear.sunFloor![1]).toBeLessThan(.1);
    bakeCanopyShadows([lee, clear], track, (x, z) =>
      x * dx + z * dz > 20 && Math.abs(x * dz - z * dx) < 6 ? 28 : 0);
    expect(Math.min(...lee.sunFloor!)).toBeGreaterThan(1);
    expect(Math.max(...clear.sunFloor!)).toBeLessThan(.1);
  });
});
