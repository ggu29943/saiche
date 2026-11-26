import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AssetManager } from '../../src/assets/assetManager';
import { CARS } from '../../src/data';
import { CarView } from '../../src/render/carView';

async function loadParkedModel(id, assets) {
  const car = await CarView.load(CARS[id], 'valley', assets);
  if (car.source !== 'glb') throw new Error('Studio could not load the GLB for ' + id);
  return car.modelOffset.children[0];
}

function lightStudio(scene, renderer) {
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
}

// Render the shipped GLB with the same materials and paint as the driving scene.
// The model stays in its authored, wheel-on-ground pose for all four views.
export async function createStudio(id) {
  const model = await loadParkedModel(id, new AssetManager('/assets/'));
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
  lightStudio(scene, renderer);
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

// Project the models and the height scale onto one common image plane. World
// +Y is up, +Z points left, and the GLB origins keep their original Y values.
export async function drawHeightComparison() {
  const width = window.innerWidth, height = window.innerHeight;
  const groundY = height - 84;
  const maxHeight = 1.6;
  const pixelsPerMetre = (groundY - 96) / maxHeight;
  const margin = 84;
  const ids = ['hatch', 'rally', 'coupe'];
  const slot = (width - 2 * margin) / ids.length;
  const centrePixel = i => margin + (i + 0.5) * slot;
  const assets = new AssetManager('/assets/');
  const models = await Promise.all(ids.map(id => loadParkedModel(id, assets)));

  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  lightStudio(scene, renderer);
  models.forEach((model, i) => {
    const bounds = new THREE.Box3().setFromObject(model);
    const centerZ = (bounds.max.z + bounds.min.z) / 2;
    model.position.z += (width / 2 - centrePixel(i)) / pixelsPerMetre - centerZ;
    scene.add(model);
  });
  const halfWidth = width / (2 * pixelsPerMetre);
  const camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, groundY / pixelsPerMetre,
    (groundY - height) / pixelsPerMetre, 0.1, 50);
  camera.position.set(12, 0, 0);
  camera.lookAt(0, 0, 0);

  const chart = document.createElement('canvas');
  chart.width = width;
  chart.height = height;
  const ctx = chart.getContext('2d');
  const sans = '"Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#eef2f2';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#24363d';
  ctx.font = '600 36px ' + sans;
  ctx.fillText('车身侧视高度对照', margin, 57);
  ctx.font = '400 23px ' + sans;
  ctx.textAlign = 'right';
  ctx.fillText('离地高度（m）  ·  每格 0.1 m', width - margin, 57);

  ctx.textBaseline = 'middle';
  for (let tick = 0; tick <= maxHeight * 10; tick++) {
    const metres = tick / 10;
    const y = groundY - metres * pixelsPerMetre;
    const major = tick % 5 === 0;
    ctx.strokeStyle = tick === 0 ? '#354a51' : major ? '#96a7ab' : '#c7d1d3';
    ctx.lineWidth = tick === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(width - margin, y);
    ctx.stroke();
    ctx.fillStyle = major ? '#24363d' : '#627278';
    ctx.font = (major ? '600' : '400') + ' 16px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(metres.toFixed(1), margin - 12, y);
    ctx.textAlign = 'left';
    ctx.fillText(metres.toFixed(1), width - margin + 12, y);
  }
  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, 0, 0);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#24363d';
  ctx.font = '600 27px ' + sans;
  ids.forEach((id, i) => ctx.fillText(CARS[id].name + '  /  ' + id, centrePixel(i), groundY + 44));
  document.body.replaceChildren(chart);
  renderer.dispose();
}
