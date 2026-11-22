import { clamp } from '@/math/scalar';
import type { DiffConfig } from './types';

export function torqueCurve(curve: [number, number][], rpm: number): number {
  if (rpm <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (rpm >= last[0]) return last[1];
  for (let i = 0; i < curve.length - 1; i++) {
    const [r0, t0] = curve[i], [r1, t1] = curve[i + 1];
    if (r0 <= rpm && rpm <= r1) return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0);
  }
  return 0;
}

export function diffSplit(torque: number, wa: number, wb: number, diff: DiffConfig): [number, number] {
  if (diff.type === 'open') return [0.5 * torque, 0.5 * torque];
  const limit = diff.preloadNm + diff.lockRatio * Math.abs(torque);
  const transfer = clamp(diff.lockGain * (wb - wa), -limit, limit);
  return [0.5 * torque + 0.5 * transfer, 0.5 * torque - 0.5 * transfer];
}
