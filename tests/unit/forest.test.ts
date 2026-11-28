import { describe, expect, test } from 'vitest';
import { Color, MeshStandardMaterial, Vector3 } from 'three';
import { TRACKS } from '@/data';
import { bakeCanopyShadows, distantTrees, forestBounds, type TreePoint } from '@/track/forest';
import { buildTerrain, nearestSample } from '@/track/terrain';
import { Track } from '@/track/track';
import { QUALITY } from '@/render/quality';
import { assignTreeScales } from '@/track/treeScales';
import { makeTreeModel, treeSize } from '@/track/trees';

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

  test('groves grow smaller at the edge and retain dominant trees across spatial cells', () => {
    const point = (x: number, z: number, model = 'tree_a'): TreePoint => ({ x, y: 0, z, model, scale: 1 });
    const grove: TreePoint[] = [];
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      grove.push(point(x * 7, z * 7, ['tree_a', 'tree_b', 'tree_c'][Math.abs(x - z) % 3]));
    }
    const pair = [point(240, 0), point(253, 0)], lone = point(-240, 0);
    const trees = [...grove, ...pair, lone];
    assignTreeScales(trees, 317);
    const scale = trees.map(p => p.scale);
    expect(scale.every(s => s >= .6 && s <= 1.5)).toBe(true);
    expect(grove.filter(p => p.scale >= 1.38)).toHaveLength(2);
    expect(pair.filter(p => p.scale >= 1.38)).toHaveLength(1);
    expect(lone.scale).toBeLessThan(1);
    const mean = (items: TreePoint[]) => items.reduce((sum, p) => sum + p.scale, 0) / items.length;
    const edge = grove.filter(p => Math.max(Math.abs(p.x), Math.abs(p.z)) === 14);
    const core = grove.filter(p => !edge.includes(p));
    expect(mean(core)).toBeGreaterThan(mean(edge) + .15);
    assignTreeScales([...trees].reverse(), 317);
    expect(trees.map(p => p.scale)).toEqual(scale);
  });

  test.each(['tree_a', 'tree_b', 'tree_c'])('%s has foliage up to the apex in every LOD', id => {
    const height = treeSize(id).height;
    const model = makeTreeModel(id, null, null, { sky: new Color(), sun: new Vector3(0, 1, 0) });
    for (const [geometry, count] of [[model.canopy, model.sprayCount], [model.proxy, model.proxy.index!.count]] as const) {
      const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
      let highestWood = 0, highestNeedle = 0;
      for (let i = 0; i < count; i++) {
        const v = geometry.index!.getX(i);
        if (uv.getX(v) > .5 && uv.getY(v) < .5) highestWood = Math.max(highestWood, p.getY(v));
        else highestNeedle = Math.max(highestNeedle, p.getY(v));
      }
      expect(highestWood).toBeGreaterThan(height / 2);
      expect(highestWood).toBeLessThan(.70 * height);
      expect(highestNeedle).toBeCloseTo(height, 3);
    }
    const p = model.distant.getAttribute('position'), uv = model.distant.getAttribute('uv');
    model.distant.computeBoundingBox();
    expect(model.distant.boundingBox!.max.y).toBeCloseTo(height, 3);
    for (let i = 0; i < p.count; i++) if (p.getY(i) > .999 * height) {
      expect(Math.hypot(p.getX(i), p.getZ(i))).toBeCloseTo(0);
      expect(uv.getY(i)).toBeLessThan(.90); // Only the leafy whorls of the cutout reach the tip.
    }
    Object.values(model).forEach(part => { if (typeof part === 'object') part.dispose(); });
  });

  test('the sunward ridge and neighbouring crowns block transmission, an isolated tree does not shadow itself', () => {
    const track = new Track(TRACKS.coast), [sx, , sz] = track.data.environment.sunDirection;
    const norm = Math.hypot(sx, sz), dx = sx / norm, dz = sz / norm;
    const point = (along: number, across = 0): TreePoint =>
      ({ x: along * dx + across * dz, y: 0, z: along * dz - across * dx, model: 'tree_a', scale: 1 });
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
