float hashCell(vec2 cell) {
  vec3 h = fract(vec3(cell.xyx) * 0.1031);
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}

// Value and its two partial derivatives, from the same four cell corners.
vec3 valueNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hashCell(cell);
  float b = hashCell(cell + vec2(1.0, 0.0));
  float c = hashCell(cell + vec2(0.0, 1.0));
  float d = hashCell(cell + vec2(1.0));
  float crossTerm = a - b - c + d;
  vec2 slope = (vec2(b - a, c - a) + crossTerm * u.yx) * (6.0 * f * (1.0 - f));
  return vec3(a + (b - a) * u.x + (c - a) * u.y + crossTerm * u.x * u.y, slope);
}
