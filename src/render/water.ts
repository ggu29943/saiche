import { Mesh, MeshPhysicalMaterial, PlaneGeometry } from 'three';
import type { TrackData } from '@/track/types';

export function buildWater(env: TrackData['environment']) {
  if (!env.sea) return null;
  const surface = new Mesh(new PlaneGeometry(10000,10000), new MeshPhysicalMaterial({
    color: env.sea.color, roughness: 0.08, metalness: 0, envMapIntensity: 1,
  }));
  surface.name = 'sea';
  surface.rotation.x = -Math.PI/2;
  surface.position.y = env.sea.level;
  surface.updateMatrix();
  surface.matrixAutoUpdate = false;
  return surface;
}
