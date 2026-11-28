import { Color, Mesh, MeshPhysicalMaterial, OrthographicCamera, PerspectiveCamera, PlaneGeometry, RepeatWrapping, Scene,
  ShaderMaterial, Vector3, type WebGLRenderTarget } from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import type { AssetManager } from '@/assets/assetManager';
import type { TrackData } from '@/track/types';
import { QUALITY, type Quality } from './quality';

export async function buildWater(scene: Scene, track: TrackData, assets: AssetManager, quality: Quality) {
  const { sea, sunDirection, sunColor } = track.environment;
  if (!sea) return null;
  const manifest = await assets.loadManifest();
  const normals = await assets.loadTexture(manifest.env[track.id]?.waterNormals);
  const geometry = new PlaneGeometry(10000, 10000);
  const waterColor = '#1A4A6E';
  let size: number = QUALITY[quality].waterTex;
  if (normals) normals.wrapS = normals.wrapT = RepeatWrapping;
  const surface = normals ? new Water(geometry, {
    textureWidth: size, textureHeight: size, waterNormals: normals, sunDirection: new Vector3(...sunDirection).normalize(),
    sunColor, waterColor, distortionScale: 3.2, fog: true,
  }) : new Mesh(geometry, new MeshPhysicalMaterial({
    color: waterColor, roughness: .28, metalness: 0, reflectivity: .18, envMapIntensity: .22,
  }));
  // 规格未指定：远水在雾的尽头或相机远裁切距离的九成处融入同方向的天空。
  const horizonEnd = { value: QUALITY[quality].viewDistance * .9 };
  const horizonBlend = (depression: string) => `
    #ifdef USE_FOG
      float end = min(fogFar, horizonEnd);
      float horizon = smoothstep(min(fogNear, 0.5 * end), end, vFogDepth);
      // From a low shore camera, the fog range spans only a couple of pixels.
      // Let the last degree above the surface converge to the same sky as well.
      gl_FragColor.a *= (1.0 - horizon) * smoothstep(0.001, 0.025, ${depression});
    #endif`;
  if (surface instanceof Water) {
    // Keep the animated mirror and sun glints, with deep-water scattering visible
    // even at the grazing angles seen from the road along the cliff.
    const material = surface.material;
    material.uniforms.size.value = .55;
    material.uniforms.horizonEnd = horizonEnd;
    material.fragmentShader = material.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float horizonEnd;')
      .replace('noise.xzy * vec3( 1.5, 1.0, 1.5 )', 'noise.xzy * vec3(3.2, 1.0, 3.2)')
      .replace('sunLight( surfaceNormal, eyeDirection, 100.0', 'sunLight( surfaceNormal, eyeDirection, 60.0')
      .replace('float rf0 = 0.3;', 'float rf0 = 0.02;')
      .replace(/vec3 scatter = [^;]+;\s*vec3 albedo = [^;]+;/,
        `float farW = smoothstep(10.0, 160.0, distance);
         vec3 baseColor = mix(mix(waterColor, vec3(0.08, 0.30, 0.36), 0.2), waterColor, farW);
         float facing = clamp(dot(surfaceNormal, eyeDirection), 0.0, 1.0);
         vec3 scatter = baseColor * (.55 + .75 * surfaceNormal.y) * (.75 + .5 * facing);
         vec3 reflection = reflectionSample / (1.0 + reflectionSample);
         reflection *= mix(1.0, .65, smoothstep(100.0, 240.0, distance));
         vec3 albedo = scatter * getShadowMask() + reflection * (.035 + .22 * reflectance)
           + 0.7 * specularLight;`)
      .replace('vec4( outgoingLight, alpha )', 'vec4(outgoingLight, alpha * mix(.58, 1.0, farW))')
      .replace('#include <fog_fragment>', horizonBlend('eyeDirection.y'));
  } else {
    surface.material.onBeforeCompile = shader => {
      shader.uniforms.horizonEnd = horizonEnd;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 seaPosition;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nseaPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 seaPosition;\nuniform float horizonEnd;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 toEye = cameraPosition - seaPosition;
          float farW = smoothstep(10.0, 160.0, length(toEye));
          diffuseColor.rgb = mix(mix(diffuseColor.rgb, vec3(.08, .30, .36), .2), diffuseColor.rgb, farW);
          diffuseColor.a *= mix(.58, 1.0, farW);`)
        .replace('#include <fog_fragment>', horizonBlend('normalize(toEye).y'));
    };
  }
  surface.material.transparent = true;
  surface.material.onBeforeRender = (_renderer, _scene, camera) => {
    if (camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera) horizonEnd.value = camera.far * .9;
  };
  surface.renderOrder = -1;
  surface.name = 'sea';
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = sea.level;
  surface.updateMatrix();
  surface.matrixAutoUpdate = false;

  // A grazing ray through transparent water can miss the finite seabed. Fill
  // only those clear depth pixels, behind real sand and only within clear water.
  const deepWater = new Mesh(geometry, new ShaderMaterial({
    uniforms: { deepColor: { value: new Color(waterColor).multiplyScalar(.40) } },
    transparent: true, depthWrite: false, fog: false,
    vertexShader: `
      varying vec3 seaPosition;
      void main() {
        seaPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 clip = projectionMatrix * viewMatrix * vec4(seaPosition, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: `
      varying vec3 seaPosition;
      uniform vec3 deepColor;
      void main() {
        float d = distance(cameraPosition, seaPosition);
        if (d >= 200.0) discard;
        float depression = (cameraPosition.y - seaPosition.y) / d;
        float alpha = (1.0 - smoothstep(160.0, 200.0, d)) * smoothstep(.001, .025, depression);
        gl_FragColor = vec4(deepColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  deepWater.name = 'deep-water-background';
  deepWater.renderOrder = surface.renderOrder - .5;
  deepWater.matrix.copy(surface.matrix);
  deepWater.matrixAutoUpdate = false;
  scene.add(deepWater, surface);

  let reflection: WebGLRenderTarget | null = null;
  const previous = scene.onBeforeRender;
  // Water r169 keeps its framebuffer private. The mirror pass exposes that target
  // as the active one, so we can resize it and release its depth buffer on unload.
  const capture: Scene['onBeforeRender'] = function (...args) {
    previous.apply(scene, args);
    const target = args[0].getRenderTarget();
    if (target && surface instanceof Water && target.texture === surface.material.uniforms.mirrorSampler.value) {
      reflection = target;
      scene.onBeforeRender = previous;
    }
  };
  if (surface instanceof Water) scene.onBeforeRender = capture;
  function setQuality(next: Quality) {
    size = QUALITY[next].waterTex;
    reflection?.setSize(size, size);
  }
  function update(dt: number) {
    if (surface instanceof Water) surface.material.uniforms.time.value += dt * .5;
    else if (surface.material.envMap !== scene.environment) {
      // An explicit probe enables the water material's own reflection intensity.
      surface.material.envMap = scene.environment;
      surface.material.envMapRotation.copy(scene.environmentRotation);
    }
    if (reflection && reflection.width !== size) reflection.setSize(size, size);
  }
  function dispose() {
    if (scene.onBeforeRender === capture) scene.onBeforeRender = previous;
    reflection?.dispose();
  }
  return { surface, update, setQuality, dispose };
}
