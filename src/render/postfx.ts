import { HalfFloatType, type Camera, type Scene, type WebGLRenderer } from 'three';
import { BloomEffect, BrightnessContrastEffect, HueSaturationEffect, EffectComposer, EffectPass, FXAAEffect, RenderPass, SMAAEffect, SMAAPreset,
  ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { QUALITY, type Quality } from './quality';

export function createPostFX(renderer: WebGLRenderer, scene: Scene, camera: Camera, quality: Quality) {
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  composer.addPass(new RenderPass(scene, camera));
  const low = QUALITY[quality].postfx === 'low';
  if (low) composer.addPass(new EffectPass(camera, tone));
  else composer.addPass(new EffectPass(camera,
    new BloomEffect({ intensity: .6, luminanceThreshold: .85, luminanceSmoothing: .2, mipmapBlur: true }),
    new VignetteEffect({ offset: .3, darkness: .45 }), tone));
  if (scene.name === 'valley') {
    composer.addPass(new EffectPass(camera,
      new HueSaturationEffect({ saturation: .15 }), new BrightnessContrastEffect({ contrast: .08 })));
  }
  const preset = quality === 'high' ? SMAAPreset.HIGH : SMAAPreset.MEDIUM;
  composer.addPass(new EffectPass(camera, low ? new FXAAEffect() : new SMAAEffect({ preset })));
  return composer;
}
