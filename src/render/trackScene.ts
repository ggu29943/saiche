import * as THREE from 'three';
import { buildBarriers } from '@/track/barriers';
import { buildProps } from '@/track/props';
import { placeScenery } from '@/track/scenery';
import { buildTerrain } from '@/track/terrain';
import type { Track } from '@/track/track';
import { buildTrackMeshes } from '@/track/trackMesh';
import { createMaterials, type Quality } from './materials';
import { buildWater } from './water';

export function buildTrackScene(track: Track, quality: Quality = 'medium') {
  const scene = new THREE.Scene();
  const env = track.data.environment;
  scene.background = new THREE.Color(env.fogColor);
  scene.fog = new THREE.Fog(env.fogColor, env.fogNear, env.fogFar);
  scene.add(new THREE.HemisphereLight('#DDE8F5', '#4A5A3A', 1.2));
  const sun = new THREE.DirectionalLight('#FFFFFF', 2);
  sun.position.set(...env.sunDirection);
  scene.add(sun);

  const mats = createMaterials(null, quality);
  const { mesh, heightAt } = buildTerrain(track, quality, mats);
  scene.add(mesh, buildTrackMeshes(track, mats), buildBarriers(track, mats));
  scene.add(buildProps(track, heightAt), placeScenery(track, heightAt, quality, null));
  const water = buildWater(env);
  if (water) scene.add(water);
  return { scene, heightAt };
}
