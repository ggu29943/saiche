export const QUALITY = {
  low: { maxPixelRatio: 1, shadows: true, shadowMapSize: 1024, shadowRange: 40, anisotropy: 2, viewDistance: 1400,
    terrainSegments: 128, maxTrees: 800, maxForestTrees: 2000, maxRocks: 150, treeShadows: false, postfx: 'low', waterTex: 256 },
  medium: { maxPixelRatio: 1.5, shadows: true, shadowMapSize: 2048, shadowRange: 60, anisotropy: 4, viewDistance: 2200,
    terrainSegments: 192, maxTrees: 4000, maxForestTrees: 6000, maxRocks: 400, treeShadows: true, postfx: 'full', waterTex: 512 },
  high: { maxPixelRatio: 2, shadows: true, shadowMapSize: 4096, shadowRange: 80, anisotropy: 8, viewDistance: 3000,
    terrainSegments: 256, maxTrees: 9000, maxForestTrees: 12000, maxRocks: 800, treeShadows: true, postfx: 'full', waterTex: 512 },
} as const;

export type Quality = keyof typeof QUALITY;

export const initialQuality = (coarse: boolean): Quality => coarse ? 'low' : 'medium';

export class AutoQuality {
  private frames = 0;
  private elapsed = 0;

  constructor(private readonly coarse: boolean) {}

  sample(intervalMs: number, current: Quality): Quality | undefined {
    if (this.frames >= 240) return;
    if (++this.frames <= 60) return;
    this.elapsed += intervalMs;
    if (this.frames < 240) return;
    const avg = this.elapsed / 180;
    if (avg > 24 && current !== 'low') return current === 'high' ? 'medium' : 'low';
    if (avg < 11 && current === 'medium' && !this.coarse) return 'high';
  }
}
