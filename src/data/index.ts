import hatch from './cars/hatch.json'; import coupe from './cars/coupe.json'; import rally from './cars/rally.json';
import valley from './tracks/valley.json'; import coast from './tracks/coast.json';
import type { CarConfig } from '@/physics/types'; import type { TrackData } from '@/track/types';
export const CARS: Record<CarConfig['id'], CarConfig> = { hatch: hatch as unknown as CarConfig, coupe: coupe as unknown as CarConfig, rally: rally as unknown as CarConfig };
export const TRACKS: Record<TrackData['id'], TrackData> = { valley: valley as unknown as TrackData, coast: coast as unknown as TrackData };
export const CAR_IDS = ['hatch', 'coupe', 'rally'] as const;
export const TRACK_IDS = ['valley', 'coast'] as const;
