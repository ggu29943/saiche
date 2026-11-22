import type { CarConfig } from './types';

export function mf(x: number, B: number, C: number, E: number): number {
  const bx = B * x;
  return Math.sin(C * Math.atan(bx - E * (bx - Math.atan(bx))));
}

export function mfPeakX(B: number, C: number, E: number): number {
  const n = 150000;
  let bestX = 0, bestY = -1;
  for (let i = 1; i <= n; i++) {
    const x = 1.5 * i / n;
    const y = mf(x, B, C, E);
    if (y > bestY) {
      bestX = x;
      bestY = y;
    }
  }
  return bestX;
}

export function tyreForces(
  kappa: number, alpha: number, Fz: number, tire: CarConfig['tire'],
  surfaceMu: number, kp: number, ap: number,
): [number, number] {
  if (Fz <= 0) return [0, 0];
  const { lon, lat } = tire;
  const loadMu = tire.mu * (1 + tire.loadSensitivity * (Fz - tire.loadRef) / tire.loadRef);
  const D = Math.max(loadMu, 0.5 * tire.mu) * surfaceMu * Fz;
  const sx = kappa / kp, sy = alpha / ap;
  const s = Math.sqrt(sx * sx + sy * sy);
  if (s < 1e-9) return [0, 0];
  return [
    D * mf(s * kp, lon.B, lon.C, lon.E) * (sx / s),
    D * mf(s * ap, lat.B, lat.C, lat.E) * (sy / s),
  ];
}
