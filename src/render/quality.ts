export const QUALITY = {
  low: { maxPixelRatio: 1, shadows: true, shadowMapSize: 1024, shadowRange: 40, anisotropy: 2, viewDistance: 1400,
    terrainSegments: 128, maxTrees: 800, maxRocks: 150, treeShadows: false, postfx: 'low', waterTex: 256 },
  medium: { maxPixelRatio: 1.5, shadows: true, shadowMapSize: 2048, shadowRange: 60, anisotropy: 4, viewDistance: 2200,
    terrainSegments: 192, maxTrees: 2500, maxRocks: 400, treeShadows: true, postfx: 'full', waterTex: 512 },
  high: { maxPixelRatio: 2, shadows: true, shadowMapSize: 4096, shadowRange: 80, anisotropy: 8, viewDistance: 3000,
    terrainSegments: 256, maxTrees: 6000, maxRocks: 800, treeShadows: true, postfx: 'full', waterTex: 512 },
} as const;

export type Quality = keyof typeof QUALITY;
