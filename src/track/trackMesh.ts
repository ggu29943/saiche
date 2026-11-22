import * as THREE from 'three';
import { pmod } from '@/math/scalar';
import type { TrackMaterials } from '@/render/materials';
import { KERB_WIDTH, type Track } from './track';

type Surface = 'asphalt' | 'kerb' | 'grass' | 'gravel' | 'verge';
interface Vertex { x: number; y: number; z: number; u: number; v: number }
interface Strip { surface: Surface; vertices: Vertex[] }

function section(track: Track, sample: number): Strip[] {
  const i = pmod(sample, track.count);
  const pos = track.pos[i], left = track.left[i];
  const s = sample * track.step, hw = track.hw[i];
  const runoff = track.barrierOffset(i);
  const kerb = hw + (track.kerb[i] ? KERB_WIDTH : 0);
  const { vergeWidth, vergeDrop } = track.data.terrain;
  const surface = track.runoffSurface(track.s[i]);

  function vertex(d: number, u: number, v: number, lift = 0, y?: number): Vertex {
    const x = pos[0] + left[0]*d, z = pos[2] + left[2]*d;
    return { x, y: (y ?? track.heightOrEdge(x,z)) + lift, z, u, v };
  }
  const asphalt: Vertex[] = [];
  for (let j=0; j<=8; j++) {
    const d = hw - 2*hw*j/8;
    asphalt.push(vertex(d,(d+hw)/(2*hw),s/8,0.010));
  }
  const strips: Strip[] = [{ surface: 'asphalt', vertices: asphalt }];
  for (const side of [1,-1]) {
    const inside = side*hw, outside = side*kerb, wall = side*runoff;
    const wallPoint = vertex(wall,wall/4,s/4);
    const edge = side*(runoff+vergeWidth);
    const edgePoint = vertex(edge,edge/4,s/4,0,wallPoint.y-vergeDrop);
    const bottom = { ...edgePoint, y: edgePoint.y-2, u: edgePoint.u + side*2/4 };
    // All strips run from left to right across the road for upward/outward normals.
    const pair = (outer: Vertex, inner: Vertex) => side === 1 ? [outer,inner] : [inner,outer];
    strips.push(
      { surface: 'kerb', vertices: pair(vertex(outside,1,s/2,0.015),vertex(inside,0,s/2,0.015)) },
      { surface, vertices: pair(wallPoint,vertex(outside,outside/4,s/4)) },
      { surface: 'verge', vertices: pair(edgePoint,wallPoint) },
      { surface: 'verge', vertices: pair(bottom,edgePoint) },
    );
  }
  return strips;
}

class MeshData {
  positions: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];

  row(vertices: Vertex[]) {
    const start = this.positions.length/3;
    for (const { x,y,z,u,v } of vertices) {
      this.positions.push(x,y,z);
      this.uvs.push(u,v);
    }
    return start;
  }
  mesh(material: THREE.Material, name: string) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions,3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs,2));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }
}

export function buildTrackMeshes(track: Track, mats: TrackMaterials): THREE.Group {
  const group = new THREE.Group();
  group.name = 'track-surface';
  const chunkSamples = Math.max(1, Math.round(200/track.step));
  let current = section(track,0);
  for (let start=0; start<track.count; start+=chunkSamples) {
    const buffers = new Map<Surface,MeshData>();
    const previous: { buffer: MeshData; offset: number }[] = [];
    const end = Math.min(start+chunkSamples,track.count);
    for (let i=start; i<end; i++) {
      const next = section(track,i+1);
      for (const [index,strip] of current.entries()) {
        let buffer = buffers.get(strip.surface);
        if (!buffer) {
          buffer = new MeshData();
          buffers.set(strip.surface,buffer);
        }
        const prev = previous[index];
        const a = prev?.buffer === buffer ? prev.offset : buffer.row(strip.vertices);
        const b = buffer.row(next[index].vertices);
        for (let j=0; j<strip.vertices.length-1; j++) {
          buffer.indices.push(a+j,a+j+1,b+j, a+j+1,b+j+1,b+j);
        }
        previous[index] = { buffer, offset: b };
      }
      current = next;
    }
    for (const [surface,buffer] of buffers) {
      const material = surface === 'verge' ? mats.grass : mats[surface];
      group.add(buffer.mesh(material,surface+'-'+start));
    }
  }
  return group;
}
