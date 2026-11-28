import * as THREE from 'three';
import type { AssetManager } from '@/assets/assetManager';
import { hash2 } from '@/math/noise';
import { lightFoliage, type CanopyLight } from '@/render/foliage';
import { forestBounds, treeScale, type TreePoint } from './forest';
import type { Track } from './track';
import { crossedCard, treeSize } from './trees';

export function obstructionAttribute(trees: TreePoint[]) {
  const values = new Float32Array(trees.length * 3);
  trees.forEach((p, i) => values.set(p.sunFloor!, i * 3));
  return new THREE.InstancedBufferAttribute(values, 3);
}

export async function buildDistantForest(track: Track, trees: TreePoint[], assets: AssetManager, light: CanopyLight) {
  const group = new THREE.Group();
  group.name = 'distant-forest';
  const species = track.data.scenery.trees.models;
  const cards = await Promise.all(species.map(name => assets.loadTexture('scenery/' + name + '.png', true)));
  if (!cards.some(Boolean) || !trees.length) return group;
  // Pack the existing cutouts into a shared atlas so a mixed stand costs one draw per tile.
  const tileWidth = 128, tileHeight = 224;
  const canvas = document.createElement('canvas');
  canvas.width = 3 * tileWidth;
  canvas.height = tileHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  cards.forEach((card, i) => {
    if (card) ctx.drawImage(card.image, i * tileWidth + 1, 1, tileWidth - 2, tileHeight - 2);
  });
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshLambertMaterial({ map: atlas, alphaTest: .38, side: THREE.DoubleSide });
  lightFoliage(material, new THREE.Vector2(1, 1), light, 'atlas');

  const { x, z, size } = forestBounds(track);
  const tiles = new Map<number, TreePoint[]>();
  for (const p of trees) {
    if (!cards[species.indexOf(p.model)]) continue;
    const key = Math.floor((p.x - x) * 4 / size) + 4 * Math.floor((p.z - z) * 4 / size);
    const batch = tiles.get(key);
    if (batch) batch.push(p);
    else tiles.set(key, [p]);
  }
  const template = crossedCard(1, 1);
  const pose = new THREE.Object3D(), seed = track.data.scenery.seed;
  for (const [tile, batch] of tiles) {
    const geometry = template.clone();
    geometry.setAttribute('forestSlot', new THREE.InstancedBufferAttribute(
      Uint8Array.from(batch, p => species.indexOf(p.model)), 1));
    const mesh = new THREE.InstancedMesh(geometry, material, batch.length);
    mesh.name = 'forest-tile-' + tile;
    mesh.position.set(x + (tile % 4 + .5) * size / 4, 0, z + (Math.floor(tile / 4) + .5) * size / 4);
    batch.forEach((p, i) => {
      const form = treeSize(p.model), height = form.height * treeScale(p, seed);
      pose.position.set(p.x - mesh.position.x, p.y, p.z - mesh.position.z);
      pose.scale.set(height * form.aspect, height, height * form.aspect);
      pose.rotation.y = hash2(Math.round(p.x), Math.round(p.z), seed + 1) * 2 * Math.PI;
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
    });
    mesh.instanceColor = obstructionAttribute(batch);
    // Static terrain/canopy occlusion covers these trees outside the car's shadow map.
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.computeBoundingSphere();
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  template.dispose();
  return group;
}
