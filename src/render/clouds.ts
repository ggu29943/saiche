import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import type { TrackData } from '@/track/types';
import valueNoise from './valueNoise.glsl?raw';

const palettes = {
  valley: { threshold: .50, light: '#FFFFFF', shade: '#9AA6B4' },
  coast: { threshold: .52, light: '#FFB48A', shade: '#6E5A70' },
};

export function createClouds(track: TrackData, sunDirection: Vector3) {
  const { threshold, light, shade } = palettes[track.id];
  const elapsed = { value: 0 };
  // 规格未指定：以 900 m 的云层高度换算视差和风速，水平风向量取 (2, 1.5) m/s。
  const material = new ShaderMaterial({
    side: BackSide, transparent: true, depthWrite: false, fog: false,
    uniforms: {
      elapsed, threshold: { value: threshold }, sunDirection: { value: sunDirection },
      sunColor: { value: new Color(track.environment.sunColor) },
      lightColor: { value: new Color(light) }, shadeColor: { value: new Color(shade) },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        // The same dome surrounds the main and the water-reflection cameras.
        vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: `
      uniform float elapsed, threshold;
      uniform vec3 sunDirection, sunColor, lightColor, shadeColor;
      varying vec3 vDirection;
      ${valueNoise}

      // Rotate the octave grids. Carry the sun-facing slope along with density
      // so that each billow has a lit and a shaded face.
      vec2 cloudFbm(vec2 uv, vec2 towardSun) {
        const mat2 turn = mat2(.8, .6, -.6, .8);
        vec2 result = vec2(0.0);
        float weight = .5;
        for (int octave = 0; octave < 6; octave++) {
          vec3 n = valueNoise(uv);
          result += weight * vec2(n.x, dot(n.yz, towardSun));
          uv = turn * uv * 2.03 + vec2(9.2, 17.1);
          towardSun = turn * towardSun;
          weight *= .5;
        }
        return result * (64.0 / 63.0);
      }

      void main() {
        vec3 dir = normalize(vDirection);
        if (dir.y <= .015) discard;
        vec2 uv = dir.xz / (dir.y + .12) * 1.6;
        uv += (cameraPosition.xz - elapsed * vec2(2.0, 1.5)) * (1.6 / 900.0);
        uv += vec2(13.8, 7.1);
        vec2 field = cloudFbm(uv, normalize(sunDirection.xz));
        float cover = smoothstep(threshold, threshold + .12, field.x);
        float alpha = cover * smoothstep(.015, .18, dir.y);
        if (alpha < .001) discard;

        float lighting = clamp(.64 - .86 * field.y - .16 * cover, .02, 1.0);
        vec3 color = mix(shadeColor, lightColor, lighting);
        float forward = pow(max(dot(dir, sunDirection), 0.0), 7.0);
        float rim = (1.0 - smoothstep(threshold + .035, threshold + .17, field.x)) * forward;
        color += sunColor * (1.8 * rim);
        gl_FragColor = vec4(color, alpha * .96);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new Mesh(new SphereGeometry(5000, 48, 24), material);
  dome.name = 'clouds';
  dome.renderOrder = -2;
  dome.frustumCulled = false;
  const start = performance.now();
  function update() { elapsed.value = (performance.now() - start) / 1000; }
  function dispose() {
    dome.removeFromParent();
    dome.geometry.dispose();
    material.dispose();
  }
  return { dome, update, dispose };
}
