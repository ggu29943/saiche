import { HalfFloatType, type Camera, type Scene, type WebGLRenderer } from 'three';
import { BloomEffect, EffectComposer, EffectPass, FXAAEffect, RenderPass, SMAAEffect, SMAAPreset,
  ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { QUALITY, type Quality } from './quality';

export function createPostFX(renderer: WebGLRenderer, scene: Scene, camera: Camera, quality: Quality) {
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  composer.addPass(new RenderPass(scene, camera));
  if (QUALITY[quality].postfx === 'low') {
    composer.addPass(new EffectPass(camera, tone));
    composer.addPass(new EffectPass(camera, new FXAAEffect()));
  } else {
    composer.addPass(new EffectPass(camera,
      new BloomEffect({ intensity: .6, luminanceThreshold: .85, luminanceSmoothing: .2, mipmapBlur: true }),
      new VignetteEffect({ offset: .3, darkness: .45 }), tone));
    const preset = quality === 'high' ? SMAAPreset.HIGH : SMAAPreset.MEDIUM;
    composer.addPass(new EffectPass(camera, new SMAAEffect({ preset })));
  }
  return composer;
}
