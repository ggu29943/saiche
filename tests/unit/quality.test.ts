import { describe, expect, it } from 'vitest';
import { AutoQuality, initialQuality, type Quality } from '@/render/quality';

function sample(ms: number, current: Quality = 'medium', coarse = false) {
  const auto = new AutoQuality(coarse);
  for (let i = 0; i < 60; i++) expect(auto.sample(1000, current)).toBeUndefined();
  for (let i = 0; i < 179; i++) expect(auto.sample(ms, current)).toBeUndefined();
  const result = auto.sample(ms, current);
  for (let i = 0; i < 240; i++) expect(auto.sample(99, current)).toBeUndefined();
  return result;
}

describe('automatic race quality', () => {
  it('starts desktop at medium and coarse pointers at low', () => {
    expect(initialQuality(false)).toBe('medium');
    expect(initialQuality(true)).toBe('low');
  });

  it('chooses at most one adjacent tier after its 60 + 180 frame window', () => {
    expect(sample(25)).toBe('low');
    expect(sample(25, 'high')).toBe('medium');
    expect(sample(25, 'low')).toBeUndefined();
    expect(sample(10)).toBe('high');
    expect(sample(10, 'medium', true)).toBeUndefined();
    expect(sample(11)).toBeUndefined();
    expect(sample(24)).toBeUndefined();
  });
});
