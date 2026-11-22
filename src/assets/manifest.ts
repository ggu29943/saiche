import type { CarConfig } from '@/physics/types';
import type { TrackData } from '@/track/types';

export interface EngineVoice { file?: string; rpm: number; load: 'on' | 'off' }
export interface Manifest {
  version: number;
  cars: Partial<Record<CarConfig['id'], { model?: string; engine?: EngineVoice[] }>>;
  env: Partial<Record<TrackData['id'], { hdri?: string; sunU?: number; waterNormals?: string }>>;
  track: Partial<Record<'asphalt' | 'grass' | 'gravel' | 'concrete' | 'rock', {
    albedo?: string; rough?: string; normal?: string;
  }>>;
  scenery: Partial<Record<string, string>>;
  audio: Partial<Record<string, string>>;
}
export const EMPTY_MANIFEST: Manifest = { version: 1, cars: {}, env: {}, track: {}, scenery: {}, audio: {} };
