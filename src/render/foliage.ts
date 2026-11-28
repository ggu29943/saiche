import { Color, DataUtils, ShaderChunk, Vector2, type Material, type Vector3,
  type WebGLRenderer, type WebGLRenderTarget } from 'three';

export interface CanopyLight { sky: Color; sun: Vector3 }

export function canopyLight(renderer: WebGLRenderer, probe: WebGLRenderTarget, fog: Color, intensity: number, sun: Vector3): CanopyLight {
  const sky = fog.clone().multiplyScalar(intensity);
  // In the r169 PMREM atlas the last roughness level has 16px faces. Its +Y face
  // averages the upper sky, including an HDRI when present. Read once, off the draw loop.
  const pixel = new Uint16Array(4);
  void renderer.readRenderTargetPixelsAsync(probe, 6 * 48 + 16 + 8, probe.height - 64 + 8, 1, 1, pixel)
    .then(result => {
      if (!result) return;
      sky.setRGB(DataUtils.fromHalfFloat(pixel[0]), DataUtils.fromHalfFloat(pixel[1]), DataUtils.fromHalfFloat(pixel[2]))
        .multiplyScalar(intensity);
    }).catch(() => { /* The horizon colour supplies sky fill on devices without half-float readback. */ });
  return { sky, sun };
}

type FoliageShape = 'sprays' | 'card' | 'atlas' | 'mesh' | 'bark';

const lambertOrPhysicalSun = ShaderChunk.lights_fragment_begin;
const sunLoop = lambertOrPhysicalSun.indexOf('getDirectionalLightInfo(');
const shadedSun = lambertOrPhysicalSun.slice(0, sunLoop) + lambertOrPhysicalSun.slice(sunLoop).replace(
  'RE_Direct( directLight,', `
    // Three has already multiplied this light by its shadow-map visibility.
    float alignment = smoothstep(.52, .96, dot(-geometryViewDir, directLight.direction));
    float visibleSkyline = smoothstep(0.0, .055, foliage.y - foliage.w);
    directLight.color *= visibleSkyline;
    if (alignment > 0.0 && visibleSkyline > 0.0) {
      float rim = smoothstep(.22, .82, length(foliage.xz) * 2.0 / max(.12, 1.0 - foliage.y));
      float needles = max(rim * rim, 1.0 - diffuseColor.a) * smoothstep(.10, .24, foliage.y);
      #ifdef USE_MAP
        // A coarse alpha mip measures surrounding foliage, so isolated needles pass
        // more light than the opaque centre of the very same branch or billboard.
        float cover = textureLod(map, vMapUv, 4.0).a;
        needles *= mix(.18, 1.0, 1.0 - smoothstep(.20, .92, cover));
      #endif
      #ifdef FOLIAGE_SPRAYS
        needles *= 1.0 - step(.5, vMapUv.x) * (1.0 - step(.5, vMapUv.y));
      #endif
      vec3 tint = mix(diffuseColor.rgb, sqrt(max(diffuseColor.rgb, vec3(0.0))), .62);
      vec3 sunlight = directLight.color * mix(vec3(1.0), directLight.color / max(max3(directLight.color), .001), .42);
      reflectedLight.directDiffuse += sunlight * tint * (.42 * alignment * alignment * needles);
    }
    RE_Direct( directLight,`);

// instanceColor holds the obstruction heights at the left, middle and right of
// this tree as seen from the sun. Keep authored vertex colours independent.
export function lightFoliage(material: Material, size: Vector2, light: CanopyLight, shape: FoliageShape) {
  material.customProgramCacheKey = () => 'canopy-' + shape;
  material.onBeforeCompile = shader => {
    shader.uniforms.canopySky = { value: light.sky };
    shader.uniforms.canopySun = { value: light.sun };
    shader.uniforms.canopySize = { value: size };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      uniform vec2 canopySize;
      uniform vec3 canopySun;
      varying vec4 foliage;
      ${shape === 'atlas' ? 'attribute float forestSlot;' : ''}
    `).replace('#include <color_vertex>', ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;', ''))
      .replace('#include <project_vertex>', `#include <project_vertex>
        foliage = vec4(position / canopySize.xyx, -1.0);
        #ifdef USE_INSTANCING_COLOR
          vec3 offset = mat3(modelMatrix) * mat3(instanceMatrix) * vec3(position.x, 0.0, position.z);
          vec2 across = normalize(canopySun.zx * vec2(1.0, -1.0));
          float side = clamp(dot(offset.xz, across) / (.39 * canopySize.x * length(instanceMatrix[0].xyz)), -1.0, 1.0);
          foliage.w = mix(instanceColor.y, side < 0.0 ? instanceColor.x : instanceColor.z, abs(side));
        #endif
        ${shape === 'atlas' ? 'vMapUv.x = (vMapUv.x + forestSlot) / 3.0;' : ''}
      `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec4 foliage;
      uniform vec3 canopySky;
      ${shape === 'sprays' ? '#define FOLIAGE_SPRAYS' : ''}
    `).replace('#include <lights_fragment_begin>', shape === 'bark' ? lambertOrPhysicalSun : shadedSun)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse += diffuseColor.rgb * canopySky * mix(.36, .90, clamp(foliage.y, 0.0, 1.0));
      `);
  };
}
