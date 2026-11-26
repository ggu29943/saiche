import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { AssetManager } from '@/assets/assetManager';
import type { Track } from '@/track/track';
import { QUALITY, type Quality } from './quality';

export async function setupEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer,
  track: Track, assets: AssetManager, quality: Quality) {
  const env = track.data.environment;
  const entry = (await assets.loadManifest()).env[track.data.id];
  const hdr = await assets.loadHDR(entry?.hdri);
  const dir = new THREE.Vector3(...env.sunDirection).normalize();
  const pmrem = new THREE.PMREMGenerator(renderer);
  let reflection: THREE.WebGLRenderTarget;
  let sky: Sky | undefined;
  try {
    if (hdr) {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      reflection = pmrem.fromEquirectangular(hdr);
      scene.background = hdr;
      const psi = ((entry?.sunU ?? .5) - .5) * 2 * Math.PI - Math.atan2(dir.z, dir.x);
      scene.environmentRotation.set(0, psi, 0);
      scene.backgroundRotation.copy(scene.environmentRotation);
    } else {
      sky = new Sky();
      sky.name = 'procedural-sky';
      sky.scale.setScalar(10000);
      const u = sky.material.uniforms;
      for (const [key, value] of Object.entries(env.skyFallback)) u[key].value = value;
      u.sunPosition.value.copy(dir);
      const skyOnly = new THREE.Scene();
      skyOnly.add(sky);
      reflection = pmrem.fromScene(skyOnly, 0, .1, 20000);
      scene.add(sky);
    }
  } finally {
    pmrem.dispose();
  }
  scene.environment = reflection.texture;
  scene.environmentIntensity = env.ambientEnvIntensity * env.exposure;
  scene.backgroundIntensity = env.exposure;
  scene.fog = new THREE.Fog(env.fogColor, env.fogNear, env.fogFar);

  const sun = new THREE.DirectionalLight(env.sunColor, env.sunIntensity * env.exposure);
  sun.name = 'sun';
  sun.castShadow = true;
  sun.shadow.bias = -.0004;
  sun.shadow.normalBias = .02;
  let texel = 0;
  function setQuality(next: Quality) {
    const { shadowMapSize: size, shadowRange: range, shadows } = QUALITY[next];
    sun.castShadow = shadows;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.dispose();
      sun.shadow.map = null;
    }
    sun.shadow.mapSize.set(size, size);
    Object.assign(sun.shadow.camera, { left: -range, right: range, top: range, bottom: -range, near: 1, far: 800 });
    sun.shadow.camera.updateProjectionMatrix();
    texel = 2 * range / size;
  }
  setQuality(quality);
  scene.add(sun, sun.target);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  const marker = new URLSearchParams(location.search).get('debugSun') === '1'
    ? new THREE.Mesh(new THREE.SphereGeometry(12), new THREE.MeshBasicMaterial({ color: '#FF00FF', fog: false })) : null;
  if (marker) scene.add(marker);

  function update(carPos: THREE.Vector3, cameraPos = carPos) {
    const x = Math.round(carPos.dot(right) / texel) * texel;
    const y = Math.round(carPos.dot(up) / texel) * texel;
    sun.target.position.copy(right).multiplyScalar(x).addScaledVector(up, y).addScaledVector(dir, carPos.dot(dir));
    sun.position.copy(sun.target.position).addScaledVector(dir, 400);
    sun.target.updateMatrixWorld();
    marker?.position.copy(cameraPos).addScaledVector(dir, 900);
  }
  function dispose() {
    scene.environment = scene.background = null;
    reflection.dispose();
    hdr?.dispose();
    if (sky) {
      sky.removeFromParent();
      sky.geometry.dispose();
      sky.material.dispose();
    }
    if (marker) {
      marker.removeFromParent();
      marker.geometry.dispose();
      marker.material.dispose();
    }
    scene.remove(sun, sun.target);
    sun.dispose();
  }
  return { sun, update, setQuality, dispose };
}
