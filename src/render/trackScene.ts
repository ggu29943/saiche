import * as THREE from 'three';
import { buildBarriers } from '@/track/barriers';
import { buildProps } from '@/track/props';
import { placeScenery } from '@/track/scenery';
import { buildTerrain } from '@/track/terrain';
import type { Track } from '@/track/track';
import { buildTrackMeshes } from '@/track/trackMesh';
import { createMaterials } from './materials';
import type { RaceRenderer } from './renderer';
import type { AssetManager } from '@/assets/assetManager';
import { setupEnvironment } from './environment';
import { buildWater } from './water';

export async function buildTrackScene(track: Track, display: RaceRenderer, assets: AssetManager) {
  const scene = new THREE.Scene();
  const { quality, renderer } = display;
  const [environment, mats] = await Promise.all([
    setupEnvironment(scene, renderer, track, assets, quality), createMaterials(assets, quality),
  ]);
  const { mesh, heightAt } = buildTerrain(track, quality, mats);
  scene.add(mesh, buildTrackMeshes(track, mats), buildBarriers(track, mats));
  scene.add(buildProps(track, heightAt), placeScenery(track, heightAt, quality, null));
  const water = buildWater(track.data.environment);
  if (water) scene.add(water);
  return { scene, heightAt, environment, mats };
}

export type TrackScene = Awaited<ReturnType<typeof buildTrackScene>>;
