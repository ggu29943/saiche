import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { DoubleSide, Vector3 } from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import meshopt from 'meshoptimizer';

const { MeshoptSimplifier } = meshopt;
MeshoptSimplifier.useExperimentalFeatures = true;
// These centre sections carry the specified roof, hood, rake and overhang.
const dimensionedPanels = new Set(['bonnet', 'hood_scoop', 'scoop_lip', 'crowned_roof_panel',
  'front_bumper', 'front_upper_fascia', 'front_splitter']);

// The loft samples define the curves. Remove redundant triangles from flat or
// nearly flat panels at export time while locking the seams to adjacent pieces.
function compactSurface(batch) {
  const positions = Float32Array.from(batch.positions);
  const indices = Uint32Array.from(batch.indices);
  const target = 3 * Math.max(1, Math.floor(indices.length * 0.36 / 3));
  const scale = MeshoptSimplifier.getScale(positions, 3);
  let reduced;
  if (batch.locked.length) {
    const locks = new Uint8Array(positions.length / 3);
    for (const index of batch.locked) locks[index] = 1;
    [reduced] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, positions, 3, [],
      locks, target, 0.00065 / scale, ['LockBorder']);
  } else {
    [reduced] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.00065 / scale, ['LockBorder']);
  }
  const [remap, count] = MeshoptSimplifier.compactMesh(reduced);
  const outputPositions = new Float32Array(count * 3);
  const outputNormals = new Float32Array(count * 3);
  for (let i = 0; i < remap.length; i++) {
    if (remap[i] === 0xffffffff) continue;
    for (let k = 0; k < 3; k++) {
      outputPositions[remap[i] * 3 + k] = positions[i * 3 + k];
      outputNormals[remap[i] * 3 + k] = batch.normals[i * 3 + k];
    }
  }
  return { positions: outputPositions, normals: outputNormals, indices: count > 65535 ? reduced : Uint16Array.from(reduced) };
}

// A sampled panel may converge to a single point at its tip. Keep only the
// vertices used by nondegenerate faces, with a valid normal at every pole.
function appendGeometry(batch, part) {
  const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);
  const keepCenter = dimensionedPanels.has(part.name);
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const indices = geometry.index?.array ?? Uint32Array.from({ length: positions.count }, (_, i) => i);
  const mapped = new Int32Array(positions.count).fill(-1);
  const origin = new Vector3(), edge = new Vector3(), face = new Vector3(), normal = new Vector3();

  for (let i = 0; i < indices.length; i += 3) {
    origin.fromBufferAttribute(positions, indices[i]);
    edge.fromBufferAttribute(positions, indices[i + 1]).sub(origin);
    face.fromBufferAttribute(positions, indices[i + 2]).sub(origin).crossVectors(edge, face);
    if (face.lengthSq() < 1e-20) continue;
    for (let corner = 0; corner < 3; corner++) {
      const index = indices[i + corner];
      if (mapped[index] === -1) {
        mapped[index] = batch.positions.length / 3;
        if (keepCenter && Math.abs(positions.getX(index)) < 1e-7) batch.locked.push(mapped[index]);
        batch.positions.push(positions.getX(index), positions.getY(index), positions.getZ(index));
        normal.fromBufferAttribute(normals, index);
        if (normal.lengthSq() < 1e-12) normal.copy(face);
        normal.normalize();
        batch.normals.push(normal.x, normal.y, normal.z);
      }
      batch.indices.push(mapped[index]);
    }
  }
  geometry.dispose();
}

export async function writeCar(filename, body, wheels, calipers, config) {
  await MeshoptSimplifier.ready;
  const document = new Document();
  const scene = document.createScene(config.id);
  const buffer = document.createBuffer();
  document.getRoot().setDefaultScene(scene);
  const materials = new Map();

  function materialFor(source) {
    if (materials.has(source)) return materials.get(source);
    const material = document.createMaterial(source.name)
      .setBaseColorFactor([...source.color.toArray(), source.opacity])
      .setMetallicFactor(source.metalness)
      .setRoughnessFactor(source.roughness)
      .setDoubleSided(source.side === DoubleSide);
    if (source.transparent) material.setAlphaMode('BLEND');
    if (source.emissive) {
      material.setEmissiveFactor(source.emissive.toArray().map(channel => Math.min(1, channel * source.emissiveIntensity)));
    }
    materials.set(source, material);
    return material;
  }

  // Within each rigid assembly, combine pieces of the same finish. Left and
  // right wheels retain separate shapes, each shared between the two axles.
  function makeMeshes(name, group) {
    const batches = new Map();
    group.updateMatrixWorld(true);
    group.traverse(child => {
      if (!child.isMesh) return;
      const material = child.material;
      if (!batches.has(material)) batches.set(material, { positions: [], normals: [], indices: [], locked: [] });
      appendGeometry(batches.get(material), child);
    });
    return Array.from(batches, ([material, batch]) => {
      const label = name + '_' + material.name;
      const accessor = (suffix, type, data) => document.createAccessor(label + suffix)
        .setBuffer(buffer).setType(type).setArray(data);
      const surface = compactSurface(batch);
      const primitive = document.createPrimitive().setMaterial(materialFor(material))
        .setAttribute('POSITION', accessor('_p', 'VEC3', surface.positions))
        .setAttribute('NORMAL', accessor('_n', 'VEC3', surface.normals))
        .setIndices(accessor('_i', 'SCALAR', surface.indices));
      return document.createMesh(label).addPrimitive(primitive);
    });
  }

  function addAssembly(name, meshes, position) {
    const parent = document.createNode(name).setTranslation(position);
    for (const mesh of meshes) parent.addChild(document.createNode(mesh.getName()).setMesh(mesh));
    scene.addChild(parent);
  }

  addAssembly('body', makeMeshes('body', body), [0, 0, 0]);
  const zMid = (config.wheels[0].mount[2] + config.wheels[2].mount[2]) / 2;
  for (const sign of [-1, 1]) {
    const side = sign > 0 ? 'left' : 'right';
    const wheel = makeMeshes(side + '_wheel', wheels.get(sign));
    const caliper = makeMeshes(side + '_caliper', calipers.get(sign));
    for (const { id, mount } of config.wheels.filter(w => Math.sign(w.mount[0]) === sign)) {
      const center = [mount[0], config.wheel.radius, mount[2] - zMid];
      addAssembly('wheel_' + id, wheel, center);
      addAssembly('caliper_' + id, caliper, center);
    }
  }
  const data = await new NodeIO().writeBinary(document);
  const temp = filename + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, data);
    await rename(temp, filename);
  } finally {
    await rm(temp, { force: true });
  }
}
