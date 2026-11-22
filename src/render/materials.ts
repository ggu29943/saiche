import * as THREE from 'three';
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
function solidTexture(hex: number) {
  const rgba = new Uint8Array([hex >> 16, (hex >> 8) & 255, hex & 255, 255]);
  const tex = new THREE.DataTexture(rgba, 1, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function terrainMaterial(grassAlbedo: THREE.Texture, rockAlbedo: THREE.Texture) {
  const material = new MeshStandardMaterial({ map: grassAlbedo, roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
  shader.uniforms.rockMap = { value: rockAlbedo };          // 占位时为 1×1 纯色 DataTexture '#6E6A63'
  shader.uniforms.grassTint = { value: new THREE.Color(1, 1, 1) };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying float vWNy;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNy = normalize(mat3(modelMatrix) * objectNormal).y;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D rockMap;\nvarying vec3 vWPos;\nvarying float vWNy;')
    .replace('#include <map_fragment>', `
      vec4 g1 = texture2D(map, vWPos.xz / 6.0);
      vec4 g2 = texture2D(map, vWPos.xz / 41.0);
      vec3 grass = g1.rgb * (0.7 + 0.6 * g2.g);
      vec3 rock = texture2D(rockMap, vWPos.xz / 9.0).rgb;
      float k = smoothstep(0.92, 0.78, vWNy);
      diffuseColor.rgb *= mix(grass, rock, k);
    `);
};
  return material;
}

export function createMaterials(_assets: null, quality: Quality): TrackMaterials {
  const standard = (color: string, roughness: number) => new MeshStandardMaterial({color, roughness, metalness: 0});
  return {
    asphalt: standard('#3A3C3F', 0.9),
    kerb: new MeshStandardMaterial({map: kerbTexture({low:2, medium:4, high:8}[quality]), roughness:0.55}),
    grass: standard('#4E6B34', 1),
    gravel: standard('#8C8270', 1),
    concrete: standard('#9E9E98', 0.85),
    terrain: terrainMaterial(solidTexture(0x4E6B34), solidTexture(0x6E6A63)),
  };
}
