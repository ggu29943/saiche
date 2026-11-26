import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AssetManager } from '../../src/assets/assetManager';
import { CARS } from '../../src/data';
import { CarView } from '../../src/render/carView';

// Render the shipped GLB with the same materials and paint as the driving scene.
// The model stays in its authored, wheel-on-ground pose for all four views.
export async function createStudio(id) {
  const car = await CarView.load(CARS[id], 'valley', new AssetManager('/assets/'));
  if (car.source !== 'glb') throw new Error('Studio could not load the GLB for ' + id);
  const model = car.modelOffset.children[0];
  const width = window.innerWidth;
  const height = window.innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#aab5bc');
  scene.fog = new THREE.Fog(scene.background, 15, 44);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environment, 0.04).texture;
  environment.dispose();
  pmrem.dispose();
  scene.environmentIntensity = 0.63;
  scene.add(new THREE.HemisphereLight('#eff7ff', '#6d6660', 0.52));
  const key = new THREE.DirectionalLight('#fff2e1', 1.9);
  key.position.set(2.4, 8, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.1, far: 20 });
  key.shadow.normalBias = 0.012;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#dbe9ff', 0.85);
  fill.position.set(-4, 3, -5);
  scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: '#7d8589', roughness: 0.97 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.004;
  floor.receiveShadow = true;
  scene.add(floor, model);

  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  // Broad ambient contact beneath the chassis supplements the key light's shadow.
  const mask = document.createElement('canvas');
  mask.width = mask.height = 256;
  const ctx = mask.getContext('2d');
  const fade = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0.76)');
  fade.addColorStop(0.57, 'rgba(0, 0, 0, 0.55)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 256, 256);
  const size = bounds.getSize(new THREE.Vector3());
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 1.36, size.z * 1.32),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(mask), transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(center.x, -0.003, center.z);
  scene.add(contact);
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
    for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
  }
  const directions = {
    front: [0.94, 0.46, 1.12], rear: [0.98, 0.50, -1.12], side: [1, 0, 0], top: [0, 1, 0],
  };
  return view => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.fromArray(directions[view]).normalize().multiplyScalar(12).add(center);
    if (view === 'top') camera.up.set(-1, 0, 0);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    const projected = new THREE.Box3().setFromPoints(corners.map(p => p.clone().applyMatrix4(camera.matrixWorldInverse)));
    const size = projected.getSize(new THREE.Vector3());
    const halfHeight = Math.max(size.y, size.x * height / width) * 0.585;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.right = halfHeight * width / height;
    camera.left = -camera.right;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    renderer.getContext().finish();
  };
}
