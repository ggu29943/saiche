import { expect, test } from 'vitest';
import { MeshStandardMaterial } from 'three';
import { TRACKS } from '@/data';
import { Track } from '@/track/track';
import { buildTerrain } from '@/track/terrain';

test.each(['low', 'medium', 'high'] as const)('valley %s terrain stays beneath the road and runoff', quality => {
  const track = new Track(TRACKS.valley);
  const material = new MeshStandardMaterial();
  const { mesh, heightAt } = buildTerrain(track, quality, { terrain: material });
  for (let i = 0; i < track.count; i += 10) {
    const hw = track.hw[i], outer = hw + track.data.runoffWidth;
    for (const d of [0, hw, -hw, outer, -outer]) {
      const x = track.pos[i][0] + d * track.left[i][0];
      const z = track.pos[i][2] + d * track.left[i][2];
      const road = track.height(x, z);
      expect(road).not.toBeNull();
      expect(heightAt(x, z)).toBeLessThanOrEqual(road! - 0.05);
    }
  }
  mesh.geometry.dispose();
  material.dispose();
});
