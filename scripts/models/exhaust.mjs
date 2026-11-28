import { BufferGeometry, Float32BufferAttribute } from 'three';
import { mesh, mix, steps, v3 } from './geometry.mjs';

// 规格未指定：雨燕保留单侧双出，朱雀保留左右双出，雷隼保留单出。尺寸均为米。
const layouts = {
  hatch: { centers: [.51, .675], halfSpan: .081, radius: .037, rise: .061 },
  coupe: { centers: [-.65, .65], halfSpan: .086, radius: .043, rise: .063 },
  rally: { centers: [.645], halfSpan: .095, radius: .047, rise: .066 },
};

export function exhaustOpenings(id, at, floor) {
  const { centers, halfSpan, radius, rise } = layouts[id];
  return centers.map(u => ({
    left: u - halfSpan, right: u + halfSpan, columns: new Set(),
    x: at(u, .10).x, y: floor + rise, radius,
  }));
}

// Follow the surface continuously from the outside of the bumper, down into
// the recess, back out along the pipe, over its rolled lip and into its bore.
// Each section wraps at its last vertex, including the normals at that seam.
function loft(body, name, material, rings) {
  const count = rings[0].length;
  const indices = [];
  for (let row = 1; row < rings.length; row++) {
    for (let i = 0; i < count; i++) {
      const a = (row - 1) * count + i, b = (row - 1) * count + (i + 1) % count;
      indices.push(a, a + count, b, b, a + count, b + count);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(rings.flatMap(ring => ring.flatMap(p => p.toArray())), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  mesh(body, name, material, geometry);
}

export function buildExhaust(body, opening, at, fraction, lowerTrim, materials) {
  const { left, right, x, y, radius } = opening;
  const columns = [...opening.columns].sort((a, b) => a - b);
  const side = (u, t) => at(u, t * lowerTrim(u));
  // Use the same perimeter as the neighbouring valance panels. Extra samples
  // lie on the actual triangle edges so the socket and bumper meet exactly.
  const border = [
    ...columns.map(u => side(u, 0)),
    ...steps(3).slice(1).map(t => side(right, t)),
    ...columns.slice(0, -1).reverse().map(u => side(u, 1)),
    ...steps(3).slice(1, -1).reverse().map(t => side(left, t)),
  ];
  const perimeter = border.flatMap((p, i) => {
    const q = border[(i + 1) % border.length];
    return steps(Math.max(1, Math.ceil(p.distanceTo(q) / .009))).slice(0, -1).map(t => p.clone().lerp(q, t));
  });
  const directions = perimeter.map(p => {
    const distance = Math.hypot(p.x - x, p.y - y);
    if (distance <= radius + .013) throw new Error(`Exhaust at x=${x.toFixed(3)} exceeds its valance panel`);
    return [(p.x - x) / distance, (p.y - y) / distance];
  });
  // Invert the tapered fascia at a physical X/Y. The rings are circular in
  // rear elevation, and the lip follows the local rake at every azimuth.
  function skin(px, py) {
    let lo = left, hi = right;
    for (let i = 0; i < 22; i++) {
      const u = (lo + hi) / 2;
      if (at(u, fraction(u, py)).x < px) lo = u;
      else hi = u;
    }
    const u = (lo + hi) / 2;
    return v3(px, py, at(u, fraction(u, py)).z);
  }
  function ring(r, depth) {
    return directions.map(([dx, dy]) => {
      const p = skin(x + r * dx, y + r * dy);
      p.z += depth; // positive Z goes into the car
      return p;
    });
  }
  const mouth = ring(radius + .013, 0);
  const surround = steps(4).slice(1, -1).map(t => perimeter.map((p, i) =>
    skin(mix(p.x, mouth[i].x, t), mix(p.y, mouth[i].y, t))));
  loft(body, 'lower_valance', materials.dark, [perimeter, ...surround, mouth]);
  const pipeRoot = ring(radius - .001, .052);
  loft(body, 'exhaust_socket', materials.dark, [mouth, ring(radius + .011, .001),
    ring(radius + .008, .006), ring(radius + .008, .047), ring(radius + .006, .052), pipeRoot]);
  const throat = ring(radius - .005, -.014);
  loft(body, 'exhaust_tip', materials.chrome, [pipeRoot, ring(radius - .001, .010),
    ring(radius, -.022), ring(radius - .001, -.0245), ring(radius - .0025, -.025),
    ring(radius - .004, -.024), ring(radius - .005, -.022), throat]);
  loft(body, 'exhaust_bore', materials.rubber, [throat, ring(radius - .005, .057), ring(0, .062)]);
}
