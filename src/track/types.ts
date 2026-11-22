import type { V3 } from '@/math/vec3';
export interface ControlPoint { x: number; y: number; z: number; halfWidth: number; bankDeg: number; }
export interface TrackData {
  id: 'valley' | 'coast'; name: string; description: string;
  runoffWidth: number; runoffSurface: 'grass' | 'gravel';
  runoffOverrides: { from: number; to: number; surface: 'grass' | 'gravel' }[];
  barrier: { type: 'wall' | 'guardrail'; height: number };
  startS: number; spawnBehindStart: number; sectorFractions: [number, number, number];
  environment: {
    hdri: string; sunDirection: V3; sunColor: string; sunIntensity: number; ambientEnvIntensity: number;
    exposure: number; fogColor: string; fogNear: number; fogFar: number;
    sea: { level: number; color: string } | null;
    skyFallback: { turbidity: number; rayleigh: number; mieCoefficient: number; mieDirectionalG: number };
  };
  terrain: {
    size: number;
    farField: { type: 'hills' | 'coast'; base: number; amplitude: number; frequency: number; octaves: number;
                coastZ?: number; coastSlope?: number; minHeight?: number; maxHeight?: number };
    vergeWidth: number; vergeDrop: number; blendDistance: number;
  };
  scenery: {
    seed: number;
    trees: { density: number; minFromBarrier: number; maxFromBarrier: number; spacing: number; models: string[] };
    rocks: { density: number; minFromBarrier: number; maxFromBarrier: number; spacing: number; models: string[] };
  };
  props: ({ model: string; s: number; d: number; yawOffsetDeg: number } | { model: string; x: number; z: number; yawDeg: number })[];
  controlPoints: ControlPoint[];
}
export interface Projection { a: number; f: number; s: number; d: number; yc: number; hw: number; bank: number; kerb: boolean; }
