import * as THREE from 'three';
import type { AssetManager } from '@/assets/assetManager';
import { lerp, pmod } from '@/math/scalar';
import type { Track } from './track';

function canvasMap(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function gantry(hw: number) {
  const group = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: '#1C1C1E' });
  const post = new THREE.BoxGeometry(0.5, 6, 0.5);
  for (const side of [-1, 1]) {
    const upright = new THREE.Mesh(post, frame);
    upright.position.set(side * (hw + 1), 3, 0);
    group.add(upright);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2 * hw + 2.5, 1.2, 0.6), frame);
  beam.position.y = 6;
  group.add(beam);
  const signMap = canvasMap(1024, 128, ctx => {
    ctx.fillStyle = '#1C1C1E';
    ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 96px sans-serif';
    ctx.fillText('APEX LINE', 512, 64);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: signMap }));
  sign.rotation.y = Math.PI;
  sign.position.set(0, 6, -0.31);
  group.add(sign);
  return group;
}

function lighthouse() {
  const group = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.5, 24, 16),
    new THREE.MeshStandardMaterial({ color: '#FFFFFF' }));
  tower.position.y = 12;
  group.add(tower);
  const red = new THREE.MeshStandardMaterial({ color: '#B22222' });
  for (const y of [8, 16]) {
    const radius = 3.5 - y / 24 + 0.015;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius - 1/24, radius + 1/24, 2, 16), red);
    ring.position.y = y;
    group.add(ring);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.2),
    new THREE.MeshStandardMaterial({ color: '#FFE9A8', emissive: '#FFE9A8', emissiveIntensity: 2 }));
  lamp.position.y = 24;
  group.add(lamp);
  return group;
}

function startLine(track: Track) {
  const map = canvasMap(256, 64, ctx => {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 8; col++) {
        ctx.fillStyle = (row + col) % 2 ? '#141414' : '#FFFFFF';
        ctx.fillRect(col * 32, row * 32, 32, 32);
      }
    }
  });
  const geom = new THREE.PlaneGeometry(1, 0.6, 8, 1);
  const pos = geom.getAttribute('position');
  for (let j = 0; j < pos.count; j++) {
    const s = pmod(track.data.startS - pos.getY(j), track.length) / track.step;
    const i = Math.floor(s), b = pmod(i + 1, track.count), f = s - i;
    const left = track.leftAt({ a: i, f });
    const d = 2 * lerp(track.hw[i], track.hw[b], f) * pos.getX(j);
    const x = lerp(track.pos[i][0], track.pos[b][0], f) + left[0] * d;
    const z = lerp(track.pos[i][2], track.pos[b][2], f) + left[2] * d;
    pos.setXYZ(j, x, track.heightOrEdge(x, z) + 0.02, z);
  }
  geom.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'start-line';
  return mesh;
}

export async function buildProps(track: Track, heightAt: (x: number, z: number) => number, assets: AssetManager) {
  const group = new THREE.Group();
  group.name = 'track-props';
  const props = await Promise.all(track.data.props.map(async prop => {
    let x: number, z: number, y: number, yaw: number;
    const i = pmod(Math.round(('s' in prop ? prop.s : track.data.startS) / track.step), track.count);
    if ('s' in prop) {
      x = track.pos[i][0] + prop.d * track.left[i][0];
      z = track.pos[i][2] + prop.d * track.left[i][2];
      y = track.height(x, z) ?? heightAt(x, z);
      yaw = Math.atan2(track.tan[i][0], track.tan[i][2]) + THREE.MathUtils.degToRad(prop.yawOffsetDeg);
    } else {
      ({ x, z } = prop);
      y = heightAt(x, z);
      yaw = THREE.MathUtils.degToRad(prop.yawDeg);
    }
    const model = await assets.loadScenery(prop.model);
    let object: THREE.Object3D;
    if (model) {
      // Place a wrapper so authored root transforms survive track-space placement.
      object = new THREE.Group().add(model);
    } else {
      switch (prop.model) {
        case 'start_gantry': object = gantry(track.hw[i]); break;
        case 'lighthouse': object = lighthouse(); break;
        case 'grandstand': {
          const stand = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 12),
            new THREE.MeshStandardMaterial({ color: '#5A5F66' }));
          stand.geometry.translate(0, 4, 0);
          object = stand;
          break;
        }
        default: return null;
      }
    }
    object.name = prop.model;
    object.position.set(x, y, z);
    object.rotation.y = yaw;
    return object;
  }));
  for (const prop of props) if (prop) group.add(prop);
  const line = startLine(track);
  group.add(line);
  group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = object !== line;
      object.receiveShadow = true;
    }
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
  return group;
}
