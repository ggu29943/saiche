import * as T from 'three';

export const v3 = (x, y, z) => new T.Vector3(x, y, z);
export const mix = (a, b, t) => a + (b - a) * t;
export const clamp = value => Math.max(0, Math.min(1, value));
export const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
export const steps = n => Array.from({ length: n + 1 }, (_, i) => i / n);

// Monotone cubic Hermite interpolation avoids overshooting the fender or deck lip.
export function profile(keys, z) {
  let i = keys.findIndex(key => key[0] > z) - 1;
  if (z <= keys[0][0]) return keys[0][1];
  if (i < 0) return keys.at(-1)[1];
  const slope = j => (keys[j + 1][1] - keys[j][1]) / (keys[j + 1][0] - keys[j][0]);
  const tangent = j => {
    if (j === 0) return slope(0);
    if (j === keys.length - 1) return slope(j - 1);
    const a = slope(j - 1), b = slope(j);
    return a * b <= 0 ? 0 : 2 * a * b / (a + b);
  };
  const [za, a] = keys[i], [zb, b] = keys[i + 1];
  const h = zb - za, t = (z - za) / h;
  return mix(a, b, smooth(t)) + h * t * (1 - t) * ((1 - t) * tangent(i) - t * tangent(i + 1));
}

export function mesh(parent, name, material, geometry) {
  const m = new T.Mesh(geometry, material);
  m.name = name;
  parent.add(m);
  return m;
}

// Orient a sampled parametric surface using one known exterior direction.
export function patch(parent, name, mat, us, vs, at, outward) {
  const pos = [], index = [];
  for (const v of vs) for (const u of us) pos.push(...at(u, v).toArray());
  const vertices = new T.Float32BufferAttribute(pos, 3);
  const stride = us.length;
  const middle = Math.floor((vs.length - 1) / 2) * stride + Math.floor((stride - 1) / 2);
  const vertex = i => new T.Vector3().fromBufferAttribute(vertices, i);
  const du = vertex(middle + 1).sub(vertex(middle));
  const dv = vertex(middle + stride).sub(vertex(middle));
  const flip = du.cross(dv).dot(outward) < 0;
  for (let j = 0; j < vs.length - 1; j++) for (let i = 0; i < stride - 1; i++) {
    const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
    if (flip) index.push(a, c, b, b, c, d);
    else index.push(a, b, c, b, d, c);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', vertices);
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return mesh(parent, name, mat, geometry);
}

export function bead(parent, name, material, points, radius, sides = 6) {
  const curve = new T.CatmullRomCurve3(points);
  return mesh(parent, name, material, new T.TubeGeometry(curve, Math.max(points.length, 12), radius, sides, false));
}

export function oval(parent, name, material, center, radii, detail = 20) {
  const object = mesh(parent, name, material, new T.SphereGeometry(1, detail, Math.ceil(detail / 2)));
  object.scale.set(...radii);
  object.position.copy(center);
  return object;
}

export function makeMaterials(car) {
  const coat = (name, color, metalness, roughness, extra = {}) => {
    const m = new T.MeshStandardMaterial({ color, metalness, roughness, ...extra });
    m.name = name;
    return m;
  };
  return {
    paint: new T.MeshPhysicalMaterial({ name: 'paint', color: car.visual.paints[0], metalness: .05,
      roughness: .35, clearcoat: 1, clearcoatRoughness: .06 }),
    glass: coat('glass', '#182934', 0.16, 0.11, { transparent: true, opacity: 0.54, side: T.DoubleSide }),
    heater: coat('heated_glass_traces', '#594638', 0.22, 0.54),
    dark: coat('satin_graphite', '#23272c', 0.22, 0.36),
    rubber: coat('weatherstrip', '#11161b', 0.02, 0.53),
    textile: coat('upholstery', '#303740', 0.02, 0.78),
    piping: coat('seat_piping', '#575e65', 0.07, 0.57),
    alloy: coat('satin_aluminium', '#9ba7b0', 0.62, 0.31),
    chrome: coat('polished_trim', '#c3cbd4', 0.75, 0.20),
    lens: coat('lamp_housing', '#2b3640', 0.52, 0.19),
    opticCover: coat('headlamp_cover', '#d1e3ef', 0.19, 0.10, { transparent: true, opacity: 0.13 }),
    redLens: coat('ruby_lens', '#731a20', 0.28, 0.19),
    accent: coat('accent', car.id === 'rally' ? '#e1a22b' : '#ca332a', 0.28, 0.30),
    light_head: coat('light_head', '#dfebed', 0.13, 0.18, { emissive: '#e4eff8', emissiveIntensity: 0.35 }),
    light_tail: coat('light_tail', '#b5242d', 0.1, 0.20, { emissive: '#bd1523', emissiveIntensity: 0.35 }),
    light_brake: coat('light_brake', '#e21e22', 0.1, 0.17, { emissive: '#dc151c', emissiveIntensity: 0.35 }),
  };
}
