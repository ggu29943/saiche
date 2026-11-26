import * as THREE from 'three';
import { MeshStandardMaterial } from 'three';
import type { AssetManager } from '@/assets/assetManager';
import type { Manifest } from '@/assets/manifest';
import { kerbTexture } from '@/track/kerbTexture';
export type Quality = 'low' | 'medium' | 'high';
export type TrackMaterials = {
  asphalt: MeshStandardMaterial;
  kerb: MeshStandardMaterial;
  grass: MeshStandardMaterial;
  gravel: MeshStandardMaterial;
  concrete: MeshStandardMaterial;
  terrain: MeshStandardMaterial;
};
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
  material.userData.rockMap = rockAlbedo;
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

type Surface = keyof Manifest['track'];
type SurfaceMaps = Awaited<ReturnType<typeof loadMaps>>;

async function loadMaps(assets: AssetManager, manifest: Manifest, name: Surface) {
  const entry = manifest.track[name];
  const [map, normalMap, roughnessMap] = await Promise.all([
    assets.loadTexture(entry?.albedo, true), assets.loadTexture(entry?.normal), assets.loadTexture(entry?.rough),
  ]);
  return { map, normalMap, roughnessMap };
}

export function setTrackAnisotropy(materials: TrackMaterials, anisotropy: number) {
  const textures = new Set<THREE.Texture>();
  for (const mat of Object.values<MeshStandardMaterial>(materials)) {
    for (const tex of [mat.map, mat.normalMap, mat.roughnessMap, mat.userData.rockMap]) {
      if (tex instanceof THREE.Texture) textures.add(tex);
    }
  }
  for (const tex of textures) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = anisotropy;
    tex.needsUpdate = true;
  }
}

function buildMaterials(quality: Quality, maps?: Partial<Record<Surface, SurfaceMaps>>): TrackMaterials {
  const standard = (name: Surface, fallback: string, roughness: number) => {
    const textures = maps?.[name];
    return new MeshStandardMaterial({ ...textures, color: textures?.map ? 0xffffff : fallback,
      roughness: textures?.roughnessMap ? 1 : roughness, metalness: 0 });
  };
  const asphalt = standard('asphalt', '#3A3C3F', .9);
  asphalt.normalScale.set(.8, .8);
  const anisotropy = { low: 2, medium: 4, high: 8 }[quality];
  const materials = {
    asphalt,
    kerb: new MeshStandardMaterial({ map: kerbTexture(anisotropy), roughness: .55 }),
    grass: standard('grass', '#4E6B34', 1),
    gravel: standard('gravel', '#8C8270', 1),
    concrete: standard('concrete', '#9E9E98', .85),
    terrain: terrainMaterial(maps?.grass?.map ?? solidTexture(0x4E6B34), maps?.rock?.map ?? solidTexture(0x6E6A63)),
  };
  setTrackAnisotropy(materials, anisotropy);
  return materials;
}

export function createMaterials(assets: null, quality: Quality): TrackMaterials;
export function createMaterials(assets: AssetManager, quality: Quality): Promise<TrackMaterials>;
export function createMaterials(assets: AssetManager | null, quality: Quality) {
  if (!assets) return buildMaterials(quality);
  return assets.loadManifest().then(async manifest => {
    const surfaces = ['asphalt', 'grass', 'gravel', 'concrete', 'rock'] as const;
    const entries = await Promise.all(surfaces.map(async name => [name, await loadMaps(assets, manifest, name)] as const));
    return buildMaterials(quality, Object.fromEntries(entries));
  });
}
