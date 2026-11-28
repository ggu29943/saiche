import * as THREE from 'three';
import { MeshStandardMaterial } from 'three';
import type { AssetManager } from '@/assets/assetManager';
import type { Manifest } from '@/assets/manifest';
import { kerbTexture } from '@/track/kerbTexture';
import valueNoise from './valueNoise.glsl?raw';
import { QUALITY, type Quality } from './quality';
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

export function terrainMaterial(grassAlbedo: THREE.Texture, rockAlbedo: THREE.Texture, seaLevel?: number) {
  const material = new MeshStandardMaterial({ map: grassAlbedo, roughness: 1, metalness: 0 });
  material.userData.rockMap = rockAlbedo;
  const shoreTime = { value: 0 };
  if (seaLevel !== undefined) {
    material.defines.COAST_SHORE = 1;
    const start = performance.now();
    material.onBeforeRender = () => { shoreTime.value = (performance.now() - start) / 1000; };
  }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rockMap = { value: rockAlbedo };          // 占位时为 1×1 纯色 DataTexture '#6E6A63'
    if (seaLevel !== undefined) {
      shader.uniforms.seaLevel = { value: seaLevel };
      shader.uniforms.shoreTime = shoreTime;
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying float vWNy;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNy = normalize(mat3(modelMatrix) * objectNormal).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D rockMap;
        varying vec3 vWPos;
        varying float vWNy;
        #ifdef COAST_SHORE
          uniform float seaLevel, shoreTime;
          ${valueNoise}
        #endif`)
      .replace('#include <map_fragment>', `
        vec4 g1 = texture2D(map, vWPos.xz / 6.0);
        vec4 g2 = texture2D(map, vWPos.xz / 41.0);
        vec3 grass = g1.rgb * (0.7 + 0.6 * g2.g);
        vec3 rock = texture2D(rockMap, vWPos.xz / 9.0).rgb;
        float k = 1.0 - smoothstep(0.78, 0.92, vWNy);
        vec3 land = mix(grass, rock, k);
        #ifdef COAST_SHORE
          float y = vWPos.y - seaLevel;
          if (y < 1.6) {
            // The bottom is visible through nearby water. Beyond the clear
            // zone the distant water must blend into sky, even over the seabed.
            if (y < 0.0 && distance(cameraPosition, vWPos) > 160.0) discard;
            vec3 sand = vec3(0.62, 0.55, 0.42);
            vec3 beach = mix(sand * 0.55, sand, smoothstep(0.05, 0.45, y));
            land = mix(beach, land, smoothstep(0.4, 1.6, y));
            land *= exp(min(y, 0.0) * vec3(0.65, 0.30, 0.22));
            if (y > -0.24 && y < 0.45) {
              float n = 0.6 * valueNoise(vWPos.xz * 1.8 + shoreTime * vec2(.12, -.18)).x
                      + 0.4 * valueNoise(vWPos.xz * 6.2 + shoreTime * vec2(-.28, .07)).x;
              float lace = smoothstep(0.45, 0.75, n) * (1.0 - smoothstep(0.0, 0.22, abs(y + 0.02)));
              float wash = 0.18 * smoothstep(-0.02, 0.08, y) * (1.0 - smoothstep(0.08, 0.45, y))
                         * smoothstep(0.36, 0.72, n);
              land = mix(land, vec3(0.86, 0.88, 0.86), min(lace + wash, 0.8));
            }
          }
        #endif
        diffuseColor.rgb *= land;
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

function buildMaterials(quality: Quality, seaLevel?: number, maps?: Partial<Record<Surface, SurfaceMaps>>): TrackMaterials {
  const standard = (name: Surface, fallback: string, roughness: number) => {
    const textures = maps?.[name];
    return new MeshStandardMaterial({ ...textures, color: textures?.map ? 0xffffff : fallback,
      roughness: textures?.roughnessMap ? 1 : roughness, metalness: 0 });
  };
  const asphalt = standard('asphalt', '#3A3C3F', .9);
  asphalt.normalScale.set(.8, .8);
  const anisotropy = QUALITY[quality].anisotropy;
  const materials = {
    asphalt,
    kerb: new MeshStandardMaterial({ map: kerbTexture(anisotropy), roughness: .55 }),
    grass: standard('grass', '#4E6B34', 1),
    gravel: standard('gravel', '#8C8270', 1),
    concrete: standard('concrete', '#9E9E98', .85),
    terrain: terrainMaterial(maps?.grass?.map ?? solidTexture(0x4E6B34), maps?.rock?.map ?? solidTexture(0x6E6A63), seaLevel),
  };
  setTrackAnisotropy(materials, anisotropy);
  return materials;
}

export function createMaterials(assets: null, quality: Quality, seaLevel?: number): TrackMaterials;
export function createMaterials(assets: AssetManager, quality: Quality, seaLevel?: number): Promise<TrackMaterials>;
export function createMaterials(assets: AssetManager | null, quality: Quality, seaLevel?: number) {
  if (!assets) return buildMaterials(quality, seaLevel);
  return assets.loadManifest().then(async manifest => {
    const surfaces = ['asphalt', 'grass', 'gravel', 'concrete', 'rock'] as const;
    const entries = await Promise.all(surfaces.map(async name => [name, await loadMaps(assets, manifest, name)] as const));
    return buildMaterials(quality, seaLevel, Object.fromEntries(entries));
  });
}
