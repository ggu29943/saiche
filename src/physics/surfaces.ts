import type { GroundFn, SurfaceId } from './types';

export const SURFACES: Record<SurfaceId, { mu: number; rolling: number }> = {
  asphalt: { mu: 1.00, rolling: 0.000 },
  kerb: { mu: 0.95, rolling: 0.002 },
  grass: { mu: 0.60, rolling: 0.060 },
  gravel: { mu: 0.55, rolling: 0.120 },
};

export const flatGround: GroundFn = () => ({
  height: 0, normal: [0, 1, 0], surface: 'asphalt',
});
