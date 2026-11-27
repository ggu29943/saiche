import { Mesh, MeshPhysicalMaterial, PlaneGeometry, RepeatWrapping, Scene, Vector3, type WebGLRenderTarget } from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import type { AssetManager } from '@/assets/assetManager';
import type { TrackData } from '@/track/types';
import { QUALITY, type Quality } from './quality';

export async function buildWater(scene: Scene, track: TrackData, assets: AssetManager, quality: Quality) {
  const { sea, sunDirection, sunColor } = track.environment;
  if (!sea) return null;
  const manifest = await assets.loadManifest();
  const normals = await assets.loadTexture(manifest.env[track.id]?.waterNormals);
  const geometry = new PlaneGeometry(10000, 10000);
  let size: number = QUALITY[quality].waterTex;
  if (normals) normals.wrapS = normals.wrapT = RepeatWrapping;
  const surface = normals ? new Water(geometry, {
    textureWidth: size, textureHeight: size, waterNormals: normals, sunDirection: new Vector3(...sunDirection).normalize(),
    sunColor, waterColor: sea.color, distortionScale: 2.5, fog: true,
  }) : new Mesh(geometry, new MeshPhysicalMaterial({
    color: sea.color, roughness: .08, metalness: 0, envMapIntensity: 1,
  }));
  surface.name = 'sea';
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = sea.level;
  surface.updateMatrix();
  surface.matrixAutoUpdate = false;
  scene.add(surface);

  let reflection: WebGLRenderTarget | null = null;
  const previous = scene.onBeforeRender;
  // Water r169 keeps its framebuffer private. The mirror pass exposes that target
  // as the active one, so we can resize it and release its depth buffer on unload.
  const capture: Scene['onBeforeRender'] = function (...args) {
    previous.apply(scene, args);
    const target = args[0].getRenderTarget();
    if (target && surface instanceof Water && target.texture === surface.material.uniforms.mirrorSampler.value) {
      reflection = target;
      scene.onBeforeRender = previous;
    }
  };
  if (surface instanceof Water) scene.onBeforeRender = capture;
  function setQuality(next: Quality) {
    size = QUALITY[next].waterTex;
    reflection?.setSize(size, size);
  }
  function update(dt: number) {
    if (surface instanceof Water) surface.material.uniforms.time.value += dt * .5;
    if (reflection && reflection.width !== size) reflection.setSize(size, size);
  }
  function dispose() {
    if (scene.onBeforeRender === capture) scene.onBeforeRender = previous;
    reflection?.dispose();
  }
  return { surface, update, setQuality, dispose };
}
