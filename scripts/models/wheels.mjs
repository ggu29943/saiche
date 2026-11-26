import {
  BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, LatheGeometry,
  Mesh, MeshStandardMaterial, Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function finish(name, color, metalness, roughness) {
  const material = new MeshStandardMaterial({ color, metalness, roughness });
  material.name = name;
  return material;
}

const rubber = finish('tyre_rubber', '#151515', 0, 0.96);
const recess = finish('wheel_recess', '#15171B', 0.12, 0.8);
const graphite = finish('cast_graphite', '#575B63', 0.55, 0.4);
const silver = finish('machined_alloy', '#C6CAD0', 0.67, 0.31);
const ivory = finish('competition_white', '#DDD9CA', 0.26, 0.4);
const rotor = finish('rotor_steel', '#85898B', 0.63, 0.56);
const brakeRed = finish('caliper_oxide', '#BA3324', 0.28, 0.39);
const brakeGold = finish('caliper_gold', '#B68737', 0.39, 0.42);

const styles = {
  hatch: { rimRatio: 0.706, pairs: 7, spokes: graphite },
  coupe: { rimRatio: 0.755, pairs: 5, spokes: silver },
  rally: { rimRatio: 0.652, pairs: 15, spokes: ivory },
};

// Profiles are written (axial position, radius). Bake the axis conversion so
// the wheel node can keep its identity quaternion and rotate on local +X.
function revolve(profile, segments = 56) {
  const points = profile.map(([axial, radius]) => new Vector2(radius, axial));
  return new LatheGeometry(points, segments).rotateZ(-Math.PI / 2);
}

function button(x, y, z, radius, thickness, sides) {
  return new CylinderGeometry(radius, radius, thickness, sides)
    .rotateZ(-Math.PI / 2).translate(x, y, z);
}

function surface(positions, indices) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function partsGroup(parts, sign) {
  const group = new Group();
  for (const [material, geometries] of parts) {
    for (const geo of geometries) geo.deleteAttribute('uv');
    const geometry = mergeGeometries(geometries);
    for (const geo of geometries) geo.dispose();
    if (sign < 0) geometry.rotateY(Math.PI);
    const mesh = new Mesh(geometry, material);
    mesh.name = material.name;
    group.add(mesh);
  }
  return group;
}

function add(parts, material, geometry) {
  if (!parts.has(material)) parts.set(material, []);
  parts.get(material).push(geometry);
}

// A wheel spoke is a swept, chamfered section. Its width, twist and dish
// independently change with radius; the central raised ridge catches light.
function spoke(stations, angle, rim, halfWidth, depth = 0.14) {
  const positions = [];
  const indices = [];
  const section = [[-1, -1], [-0.95, 0.4], [-0.63, 0.85], [0.35, 1],
    [0.9, 0.54], [1, -0.6], [0.75, -1]];
  for (const [radius, offset, halfSpan, face] of stations) {
    for (const [side, height] of section) {
      const theta = angle + offset + side * halfSpan;
      positions.push(halfWidth * (face + (height - 1) * depth / 2),
        rim * radius * Math.cos(theta), rim * radius * Math.sin(theta));
    }
  }
  const n = section.length;
  for (let k = 0; k < stations.length - 1; k++) {
    for (let j = 0; j < n; j++) {
      const a = k * n + j, b = k * n + (j + 1) % n;
      indices.push(a, a + n, b, b, a + n, b + n);
    }
  }
  const end = positions.length / 3 - n;
  for (let i = 1; i < n - 1; i++) indices.push(0, i, i + 1, end, end + i + 1, end + i);
  return surface(positions, indices);
}

function addSpokes(parts, id, rim, half) {
  const style = styles[id];
  for (let i = 0; i < style.pairs; i++) {
    const angle = (i + 0.25) * 2 * Math.PI / style.pairs;
    if (id === 'rally') {
      add(parts, style.spokes, spoke([[0.23, 0, 0.125, 0.76], [0.42, 0, 0.075, 0.92],
        [0.92, 0.033, 0.035, 0.94]], angle, rim, half));
    } else if (id === 'coupe') {
      add(parts, graphite, spoke([[0.19, 0, 0.27, 0.74], [0.4, 0.075, 0.15, 0.77],
        [0.69, 0.15, 0.095, 0.84], [0.95, 0.19, 0.066, 0.90]], angle, rim, half));
      for (const direction of [-1, 1]) {
        add(parts, silver, spoke([[0.34, 0.055, 0.085, 0.79], [0.51, 0.10, 0.065, 0.87],
          [0.72, 0.15 + direction * 0.07, 0.048, 0.91],
          [0.94, 0.18 + direction * 0.15, 0.032, 0.94]], angle, rim, half, 0.10));
      }
    } else {
      for (const direction of [-1, 1]) {
        add(parts, graphite, spoke([[0.23, 0, 0.16, 0.74], [0.4, direction * 0.025, 0.10, 0.86],
          [0.67, direction * 0.09, 0.059, 0.91], [0.95, direction * 0.12, 0.057, 0.90]],
        angle, rim, half));
      }
      add(parts, silver, spoke([[0.34, 0.035, 0.049, 0.84], [0.49, 0.07, 0.037, 0.91],
        [0.92, 0.13, 0.025, 0.94]], angle, rim, half, 0.05));
    }
  }
}

function addHubAndDisc(parts, style, rim, half) {
  add(parts, rotor, revolve([[half * 0.29, rim * 0.31], [half * 0.29, rim * 0.77],
    [half * 0.39, rim * 0.77], [half * 0.39, rim * 0.31]]));
  add(parts, graphite, button(half * 0.42, 0, 0, rim * 0.32, half * 0.10, 32));
  // Vent perforations are dark flush faces on the steel rotor.
  for (let i = 0; i < 21; i++) {
    const theta = i * 2 * Math.PI / 21;
    for (const [r, t] of [[0.69, 0], [0.61, 0.055]]) {
      const y = rim * r * Math.cos(theta + t), z = rim * r * Math.sin(theta + t);
      const points = [half * 0.398, y, z], indices = [];
      for (let j = 0; j < 7; j++) {
        const a = j * 2 * Math.PI / 7;
        points.push(half * 0.398, y + rim * 0.017 * Math.cos(a), z + rim * 0.017 * Math.sin(a));
        indices.push(0, j + 1, (j + 1) % 7 + 1);
      }
      add(parts, recess, surface(points, indices));
    }
  }
  add(parts, style.spokes, button(half * 0.75, 0, 0, rim * 0.26, half * 0.14, 36));
  add(parts, graphite, button(half * 0.84, 0, 0, rim * 0.14, half * 0.06, 32));
  for (let i = 0; i < 5; i++) {
    const theta = i * 2 * Math.PI / 5;
    const y = rim * 0.195 * Math.cos(theta), z = rim * 0.195 * Math.sin(theta);
    add(parts, recess, button(half * 0.827, y, z, rim * 0.046, 0.002, 10));
    add(parts, silver, button(half * 0.849, y, z, rim * 0.033, 0.005, 6));
  }
}

export function buildWheel(cfg, sign) {
  const { radius, width } = cfg.wheel;
  const style = styles[cfg.id];
  const half = width / 2, rim = radius * style.rimRatio;
  const parts = new Map();
  // Revolve the bead, bulging sidewalls, shoulder and the circumferential
  // channels as one continuous tyre. The central lands touch the ground.
  const halfProfile = [[0, radius], [0.17 * half, radius], [0.20 * half, radius - 0.0035],
    [0.25 * half, radius - 0.0035], [0.28 * half, radius], [0.54 * half, radius],
    [0.57 * half, radius - 0.0035], [0.62 * half, radius - 0.0035], [0.65 * half, radius],
    [0.77 * half, radius - 0.002], [0.91 * half, radius - 0.012], [0.985 * half, radius - 0.028],
    [half, radius * 0.89], [0.96 * half, (radius + rim) / 2],
    // The moulded bead protector is part of the same rubber on both sidewalls.
    [0.967 * half, rim + .009], [0.965 * half, rim + .007],
    [0.90 * half, rim * 1.025], [0.78 * half, rim]];
  const tireProfile = [...halfProfile.slice(1).reverse().map(([x, r]) => [-x, r]), ...halfProfile];
  add(parts, rubber, revolve(tireProfile));

  add(parts, graphite, revolve([[-half * 0.78, rim], [-half * 0.78, rim * 0.90],
    [half * 0.72, rim * 0.90], [half * 0.85, rim * 0.92]].reverse()));
  add(parts, cfg.id === 'rally' ? ivory : silver, revolve([[half * 0.70, rim * 1.006],
    [half * 0.89, rim * 1.012], [half * 0.94, rim * 0.986], [half * 0.94, rim * 0.945],
    [half * 0.84, rim * 0.92], [half * 0.70, rim * 0.92]]));
  addHubAndDisc(parts, style, rim, half);
  addSpokes(parts, cfg.id, rim, half);
  // A single valve stem makes the wheel's rotation easy to see at low speed.
  add(parts, recess, button(half * 0.96, rim * 0.866, -rim * 0.37, 0.0041, 0.010, 8));
  return partsGroup(parts, sign);
}

export function buildCaliper(cfg, sign) {
  const rim = cfg.wheel.radius * styles[cfg.id].rimRatio;
  const half = cfg.wheel.width / 2;
  const material = cfg.id === 'rally' ? brakeGold : brakeRed;
  // Sweep the casting around the forward side of the disc, behind the spokes.
  const positions = [], indices = [];
  const rows = 12;
  const corners = [[0.54, 0.27], [0.77, 0.27], [0.84, 0.35],
    [0.84, 0.55], [0.78, 0.65], [0.59, 0.65], [0.54, 0.58]];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const angle = 1.28 + (t - 0.5) * 0.88;
    const endTaper = 0.5 + 0.5 * Math.sin(Math.PI * t) ** 0.35;
    for (let j = 0; j < corners.length; j++) {
      const [r, x] = corners[j];
      const radius = rim * (0.69 + (r - 0.69) * endTaper);
      positions.push(half * x, radius * Math.cos(angle), radius * Math.sin(angle));
      if (i < rows) {
        const a = i * corners.length + j, b = i * corners.length + (j + 1) % corners.length;
        indices.push(a, a + corners.length, b + corners.length, a, b + corners.length, b);
      }
    }
  }
  const end = rows * corners.length;
  for (let i = 1; i < corners.length - 1; i++) indices.push(0, i, i + 1, end, end + i + 1, end + i);
  const g = surface(positions, indices);
  if (sign < 0) g.rotateX(-2 * 1.28);
  return partsGroup(new Map([[material, [g]]]), sign);
}
