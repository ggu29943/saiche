// 整数哈希 → [0,1)
export function hash2(ix: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
// 值噪声，输出 [-1, 1]，使用 smoothstep 插值
export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return ((a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uz) * 2 - 1;
}
// fBm：振幅每层减半，频率每层翻倍，结果归一化到约 [-1, 1]
export function fbm(x: number, z: number, octaves: number, seed: number): number {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += amp * valueNoise(x * freq, z * freq, seed + o * 1013); norm += amp; amp *= 0.5; freq *= 2; }
  return sum / norm;
}
