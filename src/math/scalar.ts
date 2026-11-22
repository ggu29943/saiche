// src/math/scalar.ts
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const expDecay = (rate: number, dt: number) => 1 - Math.exp(-rate * dt); // 指数平滑系数
export const wrapAngle = (a: number) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
export const pmod = (a: number, b: number) => ((a % b) + b) % b;
