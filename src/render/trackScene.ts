import * as THREE from 'three';
import { buildBarriers } from '@/track/barriers';
import { buildProps } from '@/track/props';
import { placeScenery } from '@/track/scenery';
import { buildTerrain } from '@/track/terrain';
import type { Track } from '@/track/track';
import { buildTrackMeshes } from '@/track/trackMesh';
import { disposeScene } from './disposeScene';
import { QUALITY, type Quality } from './quality';
import { createMaterials, setTrackAnisotropy } from './materials';
import type { RaceRenderer } from './renderer';
import type { AssetManager } from '@/assets/assetManager';
import { setupEnvironment } from './environment';
import { buildWater } from './water';

export async function buildTrackScene(track: Track, display: RaceRenderer, assets: AssetManager) {
  const scene = new THREE.Scene();
  scene.name = track.data.id;
  const { quality, renderer } = display;
  const [environment, mats, water] = await Promise.all([
    setupEnvironment(scene, renderer, track, assets, quality), createMaterials(assets, quality, track.data.environment.sea?.level),
    buildWater(scene, track.data, assets, quality),
  ]);
  // 规格未指定：提前上传路面和地形纹理，让 GPU 上传与 CPU 生成地形重叠，缩短首帧等待。
  for (const texture of [mats.terrain.map, mats.terrain.userData.rockMap, mats.asphalt.map,
    mats.asphalt.normalMap, mats.asphalt.roughnessMap, mats.kerb.map]) {
    if (texture instanceof THREE.Texture) renderer.initTexture(texture);
  }
  const { mesh, heightAt } = buildTerrain(track, quality, mats);
  scene.add(mesh, buildTrackMeshes(track, mats), buildBarriers(track, mats));
  const [props, scenery] = await Promise.all([
    buildProps(track, heightAt, assets), placeScenery(track, heightAt, quality, assets),
  ]);
  scene.add(props, scenery);
  function setQuality(next: Quality) {
    environment.setQuality(next);
    water?.setQuality(next);
    setTrackAnisotropy(mats, QUALITY[next].anisotropy);
    scenery.traverse(node => {
      if (node instanceof THREE.InstancedMesh && node.name.startsWith('tree_')) node.castShadow = QUALITY[next].treeShadows;
    });
  }
  function dispose() {
    water?.dispose();
    environment.dispose();
    disposeScene(scene, Object.values(mats));
    renderer.renderLists.dispose();
  }
  return { scene, heightAt, environment, water, mats, setQuality, dispose };
}

export type TrackScene = Awaited<ReturnType<typeof buildTrackScene>>;
