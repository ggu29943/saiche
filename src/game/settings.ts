import type { Assists } from '@/physics/types';
export type QualityLevel = 'auto' | 'low' | 'medium' | 'high';
import type { CameraMode } from '@/render/cameraRig';
export type { CameraMode } from '@/render/cameraRig';
export interface Settings {
  version: 1;
  quality: QualityLevel;
  assists: Assists;
  steeringAssist: { keyboard: boolean; gamepad: boolean; touch: boolean };
  camera: CameraMode;
  showGhost: boolean;
  volume: { master: number; engine: number; effects: number };   // 0..1
  paint: Record<'hatch' | 'coupe' | 'rally', number>;           // 选中涂装在 paints 数组里的下标
}
export const DEFAULT_SETTINGS: Settings = {
  version: 1, quality: 'auto',
  assists: { abs: true, tcs: true, esc: true, autoGear: true },
  steeringAssist: { keyboard: true, gamepad: false, touch: true },
  camera: 'chase', showGhost: true,
  volume: { master: 0.8, engine: 0.8, effects: 0.8 },
  paint: { hatch: 0, coupe: 0, rally: 0 },
};
