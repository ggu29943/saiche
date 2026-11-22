import { test, expect } from 'vitest';
import { mulberry32 } from '@/math/rng';
import { hash2 } from '@/math/noise';
test('seeded sequence', () => {
  const next = mulberry32(1);
  expect([next(),next(),next()]).toEqual([0.6270739405881613,0.002735721180215478,0.5274470399599522]);
});
test('coordinate hash', () => {
  expect(hash2(0,0,0)).toBe(0);
  expect(hash2(1,2,3)).toBe(0.5767206135205925);
  expect(hash2(-5,7,20261121)).toBe(0.17015212518163025);
});
