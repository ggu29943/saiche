import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { ImageUtils, NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Reference dimensions from §9.3, measured independently of the generator.
const dimensions = {
  hatch: { wheelbase: 2.60, track: 1.54, radius: 0.315 },
  coupe: { wheelbase: 2.65, track: 1.58, radius: 0.335 },
  rally: { wheelbase: 2.62, track: 1.56, radius: 0.325 },
};
const wheels = ['FL', 'FR', 'RL', 'RR'];
const carMaterials = ['paint', 'glass', 'light_brake', 'light_head', 'light_tail'];
const tolerance = 0.02;
const assets = 'public/assets';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function within(value, target) {
  return Math.abs(value - target) <= tolerance + 1e-6;
}

function triangles(primitive) {
  const count = (primitive.getIndices() ?? primitive.getAttribute('POSITION')).getCount();
  switch (primitive.getMode()) {
    case Primitive.Mode.TRIANGLES: return Math.floor(count / 3);
    case Primitive.Mode.TRIANGLE_FAN:
    case Primitive.Mode.TRIANGLE_STRIP: return Math.max(0, count - 2);
    default: return 0;
  }
}

function eachWorldYZ(node, primitive, visit) {
  const matrix = node.getWorldMatrix();
  const position = primitive.getAttribute('POSITION');
  const indices = primitive.getIndices();
  const count = (indices ?? position).getCount();
  const point = [0, 0, 0];
  // Use referenced vertices and accumulated transforms, including children with
  // off-centre geometry. Accessor bounds alone cannot verify a rolling tyre.
  for (let i = 0; i < count; i++) {
    const [x, y, z] = position.getElement(indices ? indices.getScalar(i) : i, point);
    visit(matrix[1]*x + matrix[5]*y + matrix[9]*z + matrix[13],
      matrix[2]*x + matrix[6]*y + matrix[10]*z + matrix[14]);
  }
}

function measureWheel(wheel, expectedRadius, issues) {
  const name = wheel.getName();
  const [cx, cy, cz] = wheel.getWorldTranslation();
  const axle = wheel.getWorldMatrix();
  if (wheel.getScale().some(scale => Math.abs(scale - 1) > 1e-5) ||
      Math.hypot(axle[1], axle[2]) > 1e-5 || Math.abs(Math.abs(axle[0]) - 1) > 1e-5) {
    issues.push(`${name} needs unit scale and a local X axle aligned with world X`);
  }
  let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity, radius = 0;
  wheel.traverse(node => {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      eachWorldYZ(node, primitive, (wy, wz) => {
        minY = Math.min(minY, wy);
        maxY = Math.max(maxY, wy);
        minZ = Math.min(minZ, wz);
        maxZ = Math.max(maxZ, wz);
        radius = Math.max(radius, Math.hypot(wy - cy, wz - cz));
      });
    }
  });
  const radii = [radius, cy - minY, maxY - cy, cz - minZ, maxZ - cz];
  if (radii.some(r => !within(r, expectedRadius)) || !within(minY, 0)) {
    issues.push(`${name} tyre radius/contact incorrect (radius ${radius.toFixed(3)}, bottom ${minY.toFixed(3)} m)`);
  }
  return [cx, cy, cz];
}

function checkCar(scene, root, spec, bytes, issues) {
  const nodesByName = new Map();
  scene.traverse(node => {
    const name = node.getName();
    if (name !== 'body' && !/^wheel_(FL|FR|RL|RR)$/.test(name)) return;
    if (nodesByName.has(name)) issues.push(`duplicate node ${name}`);
    nodesByName.set(name, node);
  });
  const centers = new Map();
  for (const id of wheels) {
    const name = `wheel_${id}`;
    const wheel = nodesByName.get(name);
    if (!wheel) { issues.push(`missing node ${name}`); continue; }
    const center = measureWheel(wheel, spec.radius, issues);
    centers.set(id, center);
    const expected = [(id.endsWith('L') ? 1 : -1) * spec.track / 2,
      spec.radius, (id.startsWith('F') ? 1 : -1) * spec.wheelbase / 2];
    if (center.some((value, i) => !within(value, expected[i]))) {
      issues.push(`${name} centre [${center.map(v => v.toFixed(3))}] should be [${expected}] m`);
    }
  }
  // Check both axles and both sides. Individual hubs could pass even when the
  // distance between them exceeds the table's tolerance by nearly 4 cm.
  for (const [a, b, axis, expected] of [
    ['FL', 'FR', 0, spec.track], ['RL', 'RR', 0, spec.track],
    ['FL', 'RL', 2, spec.wheelbase], ['FR', 'RR', 2, spec.wheelbase],
  ]) {
    if (centers.has(a) && centers.has(b)) {
      const span = centers.get(a)[axis] - centers.get(b)[axis];
      if (!within(span, expected)) issues.push(`${a}–${b} ${span.toFixed(3)} m (expected ${expected})`);
    }
  }

  const partTriangles = new Map();
  const materials = new Set();
  const lightBounds = new Map();
  const misparented = new Set();
  const checkPart = (node, part) => {
    const name = node.getName();
    if (nodesByName.has(name) || /^caliper_(FL|FR|RL|RR)$/.test(name)) {
      if (part && (part.startsWith('wheel_') || name.startsWith('wheel_'))) {
        issues.push(`${name} must be independent of ${part}`);
      }
      part = name;
    }
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      if (!part) misparented.add(name || '(unnamed mesh)');
      partTriangles.set(part, (partTriangles.get(part) ?? 0) + triangles(primitive));
      if (part === 'body') {
        const material = primitive.getMaterial()?.getName();
        materials.add(material);
        if (material === 'light_head' || material === 'light_tail') {
          const bounds = lightBounds.get(material) ?? [Infinity, -Infinity];
          eachWorldYZ(node, primitive, (_, z) => {
            bounds[0] = Math.min(bounds[0], z);
            bounds[1] = Math.max(bounds[1], z);
          });
          lightBounds.set(material, bounds);
        }
      }
    }
    for (const child of node.listChildren()) checkPart(child, part);
  };
  for (const node of scene.listChildren()) checkPart(node, '');
  if (!nodesByName.has('body')) issues.push('missing node body');
  if (misparented.size) issues.push(`mesh outside body/wheels/calipers: ${[...misparented].join(', ')}`);
  for (const material of carMaterials) {
    if (!materials.has(material)) issues.push(`body has no geometry using ${material}`);
  }
  for (const [material, [minZ, maxZ]] of lightBounds) {
    const centerZ = (minZ + maxZ) / 2;
    if (material === 'light_head' ? !(centerZ > 0) : !(centerZ < 0)) {
      issues.push(`${material} is at the wrong end of the car (+Z must be forward)`);
    }
  }
  for (const [part, count] of partTriangles) {
    if (!count && (part === 'body' || part.startsWith('wheel_'))) issues.push(`${part} has no triangles`);
    if (part === 'body' && count > 120000) issues.push(`body exceeds 120000 triangles (${count})`);
    if (part.startsWith('wheel_') && count > 7500) issues.push(`${part} exceeds 7500 triangles (${count})`);
  }
  for (const material of root.listMaterials()) {
    if (material.getExtension('KHR_materials_unlit') || material.getExtension('KHR_materials_pbrSpecularGlossiness')) {
      issues.push(`${material.getName() || 'material'} must use PBR metallic-roughness`);
    }
  }
  const textures = root.listTextures();
  if (textures.length > 8) issues.push(`more than 8 textures (${textures.length})`);
  for (const texture of textures) {
    if (!validSize(texture.getSize())) issues.push(`invalid texture dimensions: ${texture.getName() || texture.getURI()}`);
  }
  if (bytes > 12 * 1024 * 1024) issues.push('exceeds 12 MB');
}

function validSize(size) {
  return size && size.every(n => n > 0 && n <= 2048);
}

async function checkModel(file, binary, car, issues) {
  if (binary.toString('ascii', 0, 4) !== 'glTF' || binary.readUInt32LE(4) !== 2) {
    throw new Error('expected binary glTF 2.0');
  }
  const root = (await io.read(join(assets, file))).getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error('no scene');
  let count = 0;
  scene.traverse(node => {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) count += triangles(primitive);
  });
  let limit;
  if (car) {
    checkCar(scene, root, dimensions[car], binary.byteLength, issues);
    limit = 150000;
  } else if (/\/tree_[^/]+\.glb$/i.test(file)) limit = 8000;
  else if (/\/rock_[^/]+\.glb$/i.test(file)) limit = 2000;
  if (limit && count > limit) issues.push(`${count} triangles exceeds ${limit}`);
  return `${count} triangles`;
}

function checkWav(data) {
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('expected RIFF/WAVE');
  }
  for (let i = 12; i + 8 <= data.length;) {
    const length = data.readUInt32LE(i + 4);
    if (i + 8 + length > data.length) throw new Error('truncated WAV chunk');
    if (data.toString('ascii', i, i + 4) === 'fmt ') {
      if (length < 16 || data.readUInt16LE(i + 10) !== 1 || data.readUInt32LE(i + 12) !== 44100) {
        throw new Error('expected mono 44100 Hz WAV');
      }
      return;
    }
    i += 8 + length + length % 2;
  }
  throw new Error('missing WAV fmt chunk');
}

function* manifestFiles(object) {
  for (const [key, value] of Object.entries(object)) {
    if (typeof value === 'string' && key !== 'load') yield value;
    else if (value && typeof value === 'object') yield* manifestFiles(value);
  }
}

let manifest;
try {
  manifest = JSON.parse(await readFile(join(assets, 'manifest.json'), 'utf8'));
  if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object') throw new Error('expected an object');
} catch (error) {
  console.error(`WARN  manifest.json — ${error.message}`);
  process.exit(1);
}
const carPaths = new Map(Object.entries(manifest.cars ?? {}).map(([id, car]) => [car?.model, id]));
const totals = { OK: 0, WARN: 0, MISSING: 0 };
for (const file of new Set(manifestFiles(manifest))) {
  let binary;
  try {
    binary = await readFile(join(assets, file));
  } catch (error) {
    const missing = error.code === 'ENOENT';
    const status = missing ? 'MISSING' : 'WARN';
    totals[status]++;
    console.log(`${status}  ${file} ${missing ? '（将使用占位）' : error.message}`);
    continue;
  }
  const issues = [];
  let detail = '';
  try {
    switch (extname(file).toLowerCase()) {
      case '.glb': detail = await checkModel(file, binary, carPaths.get(file), issues); break;
      case '.jpg': case '.jpeg': case '.png': {
        const mime = ImageUtils.getMimeType(binary);
        const size = ImageUtils.getSize(binary, mime);
        // Whole-tree billboard cutouts retain the natural aspect ratio of the tree.
        const billboard = /^scenery\/tree_[abc]\.png$/.test(file);
        if (!validSize(size) || (!billboard && size[0] !== size[1])) issues.push(`invalid texture dimensions: ${size?.join('×') ?? 'unknown'}`);
        break;
      }
      case '.wav': checkWav(binary); break;
    }
  } catch (error) { issues.push(error.message); }
  const status = issues.length ? 'WARN' : 'OK';
  totals[status]++;
  console.log(`${status}  ${file}${issues.length ? ` — ${issues.join('; ')}` : detail ? ` (${detail})` : ''}`);
}
console.log(`\nOK ${totals.OK}   WARN ${totals.WARN}   MISSING ${totals.MISSING}`);
