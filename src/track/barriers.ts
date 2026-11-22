import * as THREE from 'three';
import { lerp, pmod } from '@/math/scalar';
import type { TrackMaterials } from '@/render/materials';
import type { Track } from './track';

function prepareMesh(mesh: THREE.Mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
}

function beam(track: Track, side: number, wall: boolean, material: THREE.Material) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const low = wall ? -2 : 0.55 - 0.31 / 2;
  const high = wall ? track.data.barrier.height : 0.55 + 0.31 / 2;
  const thickness = wall ? 0.4 : 0.08;
  // Corners around the cross section, clockwise viewed into the left barrier.
  const corners = [[0,high],[0,low],[thickness,low],[thickness,high]];
  for (let k=0; k<=track.count; k++) {
    const i = pmod(k,track.count), p = track.pos[i], left = track.left[i];
    const offset = side*track.barrierOffset(i);
    const x = p[0]+left[0]*offset, z = p[2]+left[2]*offset;
    const ground = track.heightOrEdge(x,z);
    for (let face=0; face<4; face++) {
      const nextFace = pmod(face+1,4);
      for (const [depth,height] of [corners[face],corners[nextFace]]) {
        positions.push(x+left[0]*side*depth,ground+height,z+left[2]*side*depth);
        uvs.push(k*track.step/2, (face % 2 === 0 ? height : depth)/2);
      }
      if (!k) continue;
      const current = k*8+face*2, previous = current-8;
      if (side>0) indices.push(previous,previous+1,current, previous+1,current+1,current);
      else indices.push(previous,current,previous+1, previous+1,current,current+1);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geom.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  const mesh = new THREE.Mesh(geom,material);
  mesh.name = wall ? 'concrete-wall' : 'guardrail-beam';
  prepareMesh(mesh);
  return mesh;
}

function posts(track: Track) {
  const count = Math.round(track.length/4);
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12,0.9,0.12),
    new THREE.MeshStandardMaterial({color:'#7D8187',metalness:0.8,roughness:0.5}),
    count*2,
  );
  const matrix = new THREE.Matrix4();
  for (let j=0; j<count; j++) {
    // Distribute the closure remainder equally to keep the posts evenly spaced.
    const sample = j*track.count/count;
    const a = Math.floor(sample), f = sample-a, b = pmod(a+1,track.count);
    const left = track.leftAt({a,f});
    const px = lerp(track.pos[a][0],track.pos[b][0],f);
    const pz = lerp(track.pos[a][2],track.pos[b][2],f);
    const d = lerp(track.barrierOffset(a),track.barrierOffset(b),f)+0.10;
    for (const side of [1,-1]) {
      const x = px+side*left[0]*d, z = pz+side*left[2]*d;
      matrix.makeRotationY(Math.atan2(-left[2],left[0]));
      matrix.setPosition(x,track.heightOrEdge(x,z)+0.45,z);
      mesh.setMatrixAt(2*j+(side<0?1:0),matrix);
    }
  }
  mesh.name = 'guardrail-posts';
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  prepareMesh(mesh);
  return mesh;
}

export function buildBarriers(track: Track, mats: TrackMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'barriers';
  const wall = track.data.barrier.type === 'wall';
  const material = wall ? mats.concrete :
    new THREE.MeshStandardMaterial({color:'#B8BCC2',metalness:0.9,roughness:0.35});
  group.add(beam(track,1,wall,material),beam(track,-1,wall,material));
  if (!wall) group.add(posts(track));
  return group;
}
