import { MeshStandardMaterial } from 'three';
import { kerbTexture } from '@/track/kerbTexture';
export type Quality = 'low' | 'medium' | 'high';
export interface TrackMaterials {
  asphalt: MeshStandardMaterial;
  kerb: MeshStandardMaterial;
  grass: MeshStandardMaterial;
  gravel: MeshStandardMaterial;
  concrete: MeshStandardMaterial;
  terrain: MeshStandardMaterial;
}
export function createMaterials(_assets: null, quality: Quality): TrackMaterials {
  const standard = (color: string, roughness: number) => new MeshStandardMaterial({color, roughness, metalness: 0});
  return {
    asphalt: standard('#3A3C3F', 0.9),
    kerb: new MeshStandardMaterial({map: kerbTexture({low:2, medium:4, high:8}[quality]), roughness:0.55}),
    grass: standard('#4E6B34', 1),
    gravel: standard('#8C8270', 1),
    concrete: standard('#9E9E98', 0.85),
    terrain: standard('#4E6B34', 1),
  };
}
