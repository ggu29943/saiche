import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { AssetManager } from '@/assets/assetManager';
import type { Track } from '@/track/track';
import { createClouds } from './clouds';
import { QUALITY, type Quality } from './quality';

export async function setupEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer,
  track: Track, assets: AssetManager, quality: Quality) {
  const env = track.data.environment;
  const coastal = track.data.id === 'coast';
  const entry = (await assets.loadManifest()).env[track.data.id];
  const hdr = await assets.loadHDR(entry?.hdri);
  const dir = new THREE.Vector3(...env.sunDirection).normalize();
  const pmrem = new THREE.PMREMGenerator(renderer);
  let reflection: THREE.WebGLRenderTarget;
  let sky: Sky | undefined;
  let clouds: ReturnType<typeof createClouds> | undefined;
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
      sky.renderOrder = -3;
      sky.scale.setScalar(10000);
      const u = sky.material.uniforms;
      for (const [key, value] of Object.entries(env.skyFallback)) u[key].value = value;
      if (coastal) {
        u.turbidity.value = 10;
        u.rayleigh.value = 3.6;
        u.mieCoefficient.value = .014;
        u.mieDirectionalG.value = .78;
        // A long path through coastal haze also warms the sky opposite the solar disc.
        // Apply it to sky radiance so the environment map sees the same sunset.
        sky.material.fragmentShader = sky.material.fragmentShader.replace(
          'gl_FragColor = vec4( retColor, 1.0 );',
          `float haze = exp(-3.0 * max(direction.y, 0.0));
           vec3 transmission = mix(vec3(.92, .59, .48), vec3(1.0, .45, .25), haze);
           float peak = max(retColor.r, max(retColor.g, retColor.b));
           vec3 radiance = mix(retColor / (1.0 + .55 * peak), retColor, sundisk);
           gl_FragColor = vec4(radiance * transmission + vec3(.19, .038, .013) * haze, 1.0);`,
        );
      }
      u.sunPosition.value.copy(dir);
      const skyOnly = new THREE.Scene();
      skyOnly.add(sky);
      reflection = pmrem.fromScene(skyOnly, 0, .1, 20000);
      // In the game draw sky, clouds and distant water in that order, after opaque scenery.
      sky.material.transparent = true;
      clouds = createClouds(track.data, dir);
      scene.add(sky, clouds.dome);
    }
  } finally {
    pmrem.dispose();
  }
  scene.environment = reflection.texture;
  scene.environmentIntensity = coastal ? env.ambientEnvIntensity * env.exposure : .45;
  scene.backgroundIntensity = env.exposure;
  scene.fog = new THREE.Fog(coastal ? '#D99D79' : env.fogColor, env.fogNear, env.fogFar);

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
    clouds?.update();
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
    clouds?.dispose();
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
