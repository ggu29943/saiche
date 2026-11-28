import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '@/render/quality';
import { lightFoliage, type CanopyLight } from '@/render/foliage';
import { mulberry32 } from '@/math/rng';

type Point = [number, number, number];
type Patch = [number, number, number, number];

// The spray atlas uses a 2x2 layout: three branch cutouts, then bark.
// Dimensions pair each near model with its corresponding whole-tree cutout.
const species = {
  tree_a: { height: 9.5, aspect: 389/695, base: 1.8, tiers: 10, boughs: 8, seed: 317,
    foliage: [0.013, 0.515, 0.487, 0.985], needleUV: [.62, .43], green: '#456143' },
  tree_b: { height: 11.6, aspect: 412/695, base: 1.45, tiers: 13, boughs: 6, seed: 521,
    foliage: [0.513, 0.515, 0.987, 0.985], needleUV: [.63, .31], green: '#48695C' },
  tree_c: { height: 8.8, aspect: 441/695, base: 1.7, tiers: 9, boughs: 7, seed: 733,
    foliage: [0.013, 0.015, 0.487, 0.485], needleUV: [.75, .51], green: '#4A6244' },
} satisfies Record<string, { height: number; aspect: number; base: number; tiers: number;
  boughs: number; seed: number; foliage: Patch; needleUV: [number, number]; green: string }>;
const bark: Patch = [0.515, 0.017, 0.985, 0.480];
type Species = keyof typeof species;

function branch(from: Point, to: Point, base: number, tip: number) {
  const start = new THREE.Vector3(...from);
  const delta = new THREE.Vector3(...to).sub(start);
  const geometry = new THREE.CylinderGeometry(tip, base, delta.length(), 5, 1, true);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  return geometry.translate((from[0]+to[0])/2, (from[1]+to[1])/2, (from[2]+to[2])/2);
}

// Three irregular rings describe the shaded underside, ragged fringe and sunlit
// top of a spray of needles. Shared vertices keep the canopy rounded in daylight.
function crown(center: Point, rx: number, rz: number, depth: number, rng: () => number) {
  const sides = 10;
  const phase = rng() * Math.PI;
  const points: number[] = [], uv: number[] = [], indices: number[] = [];
  const ridge = Array.from({length:sides}, (_, i) => 0.80 + 0.20*rng() + (i%2 === 0 ? 0.24 : 0));
  const ring = (scale: number, rise: number) => {
    for (let i = 0; i < sides; i++) {
      const angle = phase + 2*Math.PI*i/sides;
      const x = scale * ridge[i] * Math.cos(angle), z = scale * ridge[i] * Math.sin(angle);
      points.push(center[0] + rx*x, center[1] + depth*(rise + 0.16*rng()), center[2] + rz*z);
      uv.push(0.5 + x*0.40, 0.45 + rise*0.25 + z*0.15);
    }
  };
  ring(0.20, -0.33);
  ring(1.00, -0.18);
  ring(0.33, 0.60);
  const apex = points.length/3;
  points.push(center[0],center[1]+depth,center[2]);
  uv.push(0.5,1);
  for (let i = 0; i < sides; i++) {
    const j = (i+1)%sides;
    for (let n = 0; n < 2; n++) {
      const a = n*sides+i, b = n*sides+j;
      indices.push(a,a+sides,b,b,a+sides,b+sides);
    }
    indices.push(i+2*sides,apex,j+2*sides);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function sprayCard(width: number, height: number, bend: number, slope: number, twist: number, columns = 2) {
  // Give each spray a curved midsurface. Its outer edge is lowered and swept
  // back, so the branch stays visible as the driver passes it or looks down.
  const geometry = new THREE.PlaneGeometry(width, height, columns, 1);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), u = x/width+0.5, v = y/height;
    p.setXYZ(i,x, y + slope*u + twist*u*v, bend*(1-4*(u-0.5)**2) + v*height*0.48);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function addWhorl(id: Species, add: (g: THREE.BufferGeometry) => void, y: number, radius: number,
  tier: number, rng: () => number) {
  const form = species[id];
  const fir = id === 'tree_b', pine = id === 'tree_c';
  const phase = tier * 2.39996;
  for (let i = 0; i < form.boughs; i++) {
    const direction = phase + (i + rng() * 0.30) * 2 * Math.PI / form.boughs;
    const reach = radius * (0.88 + rng() * 0.22);
    const lift = y + (rng() - 0.5) * 0.22;
    // The fir carries flat shelves. Spruce twigs hang down, stone pine tips
    // turn up. The cut end of each textured spray is at its right edge.
    const height = reach * (fir ? 0.32 : pine ? 0.53 : 0.64) + 0.08;
    for (const side of [-1, 1]) {
      const spray = sprayCard(reach, height, side * reach * 0.16, 0, side * height * 0.14);
      spray.translate(-reach * 0.50, 0, 0);
      spray.rotateX(side * (fir ? 0.76 : 0.38));
      spray.rotateZ(fir ? -0.08 : pine ? -0.25 : 0.14);
      spray.rotateY(direction + side * (pine ? 0.23 : 0.17));
      add(spray.translate(0, lift, 0));
    }
    if (pine) {
      const tip = sprayCard(reach * 0.52, height * 0.78, reach * 0.06, 0, 0);
      tip.translate(-reach * 0.26, 0, 0);
      tip.rotateZ(-0.74);
      tip.translate(-reach * 0.63, reach * 0.12, 0);
      tip.rotateY(direction);
      add(tip.translate(0, lift, 0));
    }
  }
}

function addCrownTip(id: Species, add: (g: THREE.BufferGeometry) => void, base: number, radius: number,
  withSprays: boolean, rng: () => number) {
  const form = species[id], depth = form.height - base;
  const fir = id === 'tree_b', pine = id === 'tree_c';
  // The terminal shoot is foliage all the way through. Its UVs stay inside
  // dense needles on the species' branch, clear of the exposed cut end.
  const core = new THREE.ConeGeometry(radius * .26, depth, 7, 3, true);
  const pos = core.getAttribute('position'), uv = core.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const t = uv.getY(i), angle = uv.getX(i) * 2 * Math.PI;
    const ridge = 1 + .16 * Math.sin(3 * angle + t * 3);
    pos.setXYZ(i, pos.getX(i) * ridge + .045 * radius * t * t, base + t * depth, pos.getZ(i) * ridge);
    uv.setXY(i, form.needleUV[0] + .045 * Math.cos(angle), form.needleUV[1] + .085 * (t - .5));
  }
  core.computeVertexNormals();
  add(core);

  const tiers = fir ? 9 : 8, boughs = form.boughs + 1;
  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / tiers, y = base + depth * t;
    const spread = 1.14 * radius * (1 - t) ** (pine ? .74 : .86);
    if (!withSprays) {
      add(crown([0, y, 0], spread, .94 * spread, depth / tiers * .94, rng));
      continue;
    }
    // Closely spaced whorls overlap the core. Upper shoots turn upward more
    // steeply, but keep the fir's shelves and the pine's upswept tips.
    for (let i = 0; i < boughs; i++) {
      const angle = tier * 2.39996 + (i + .30 * rng()) * 2 * Math.PI / boughs;
      const reach = spread * (.89 + .20 * rng());
      const needles = Math.min(depth * (1 - t) * .77, Math.max(depth / tiers, reach * (fir ? .58 : .77)));
      const twig = sprayCard(reach, needles, 0, 0, reach * .12, 1);
      twig.translate(-reach * .48, 0, 0);
      twig.rotateX((i % 2 ? 1 : -1) * (.34 + .24 * rng()));
      twig.rotateZ((pine ? -.22 : fir ? .05 : .17) - .46 * t + .24 * (rng() - .5));
      twig.rotateY(angle);
      add(twig.translate(0, y + (rng() - .5) * .22 * depth / tiers, 0));
    }
  }
  if (withSprays) {
    // A central bud and four shorter shoots emerge from the last two whorls.
    // Bend their leafy ends inward, so the outer shoots taper into the apex.
    const length = depth * .22;
    for (let i = 0; i < 5; i++) {
      const rise = i === 0 ? length : length * (.80 + .13 * rng());
      const shoot = new THREE.PlaneGeometry(1, 1, 2, 1);
      const points = shoot.getAttribute('position'), tex = shoot.getAttribute('uv');
      for (let j = 0; j < points.count; j++) {
        const t = 1 - tex.getX(j), side = tex.getY(j) - .5;
        const spread = length * .33 * (1 - t) ** .78;
        points.setXYZ(j, spread * (.70 + .16 * Math.sin(t * Math.PI)), t * rise, spread * side * 1.55);
        tex.setXY(j, .89 + (form.needleUV[0] - .89) * t, form.needleUV[1] + side * .58 * (1 - t));
      }
      shoot.computeVertexNormals();
      shoot.rotateY(i * 2.39996);
      add(shoot.translate(.045 * radius, form.height - length, 0));
    }
  }
}

function treeGeometry(id: Species, withSprays: boolean) {
  const form = species[id];
  const rng = mulberry32(form.seed);
  const parts: THREE.BufferGeometry[] = [];
  const add = (geometry: THREE.BufferGeometry, wood = false) => {
    const color = new THREE.Color(wood ? '#685544' : form.green).multiplyScalar(0.88 + rng()*0.22);
    const patch = wood ? bark : form.foliage;
    const tex = geometry.getAttribute('uv');
    const colors: number[] = [];
    for (let i = 0; i < tex.count; i++) {
      tex.setXY(i, THREE.MathUtils.lerp(patch[0],patch[2],tex.getX(i)), THREE.MathUtils.lerp(patch[1],patch[3],tex.getY(i)));
      colors.push(color.r,color.g,color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
    parts.push(geometry);
  };

  const { height, base, aspect, tiers } = form;
  const tierSpacing = (height - base) / tiers;
  const tipTier = Math.floor(tiers * .74);
  // Start the fine whorls below the last broad bough so the upper crown
  // remains attached when seen in silhouette from the opposite hillside.
  const overlapTier = tipTier - 1.25, tipBase = base + overlapTier * tierSpacing;
  const radiusAt = (t: number) => height * aspect * .49 * (1 - t) ** (id === 'tree_c' ? .76 : .92);
  add(branch([0, 0, 0], [0, tipBase, 0], .20, .045), true);
  for (let i = 0; i < tipTier; i++) {
    const t = i / tiers;
    const y = base + t * (height - base);
    const radius = radiusAt(t);
    if (withSprays) {
      addWhorl(id, add, y, radius, i, rng);
    } else {
      // Solid whorls keep the same taper in overhead views and without PNGs.
      add(crown([0, y, 0], radius, radius * 0.94, tierSpacing * 1.18, rng));
    }
  }
  addCrownTip(id, add, tipBase, radiusAt(overlapTier / tiers), withSprays, rng);
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return geometry;
}

export function treeSize(name: string) {
  return species[name === 'tree_b' || name === 'tree_c' ? name : 'tree_a'];
}

export function crossedCard(width: number, height: number) {
  const card = new THREE.PlaneGeometry(width, height, 1, 4);
  const vertices = card.getAttribute('position'), uv = card.getAttribute('uv');
  // Re-project the leafy upper whorls of each photograph into a pointed
  // silhouette. The final sample is beside the central stem. Both LODs and
  // medium shadows use this geometry, at the same eight triangles per plane.
  const rows = [
    { y: 1,    v: .84,  halfUV: 0,   halfWidth: 0,    centre: .525 },
    { y: .94,  v: .815, halfUV: .21, halfWidth: .137, centre: .508 },
    { y: .79,  v: .755, halfUV: .34, halfWidth: .34,  centre: .5 },
    { y: .54,  v: .54,  halfUV: .5,  halfWidth: .5,   centre: .5 },
    { y: 0,    v: 0,    halfUV: .5,  halfWidth: .5,   centre: .5 },
  ];
  rows.forEach(({ y, v, halfUV, halfWidth, centre }, row) => {
    for (let side = 0; side < 2; side++) {
      const i = row * 2 + side, sign = side * 2 - 1;
      vertices.setXYZ(i, sign * halfWidth * width, y * height, 0);
      uv.setXY(i, centre + sign * halfUV, v);
    }
  });
  const cross = card.clone().rotateY(Math.PI / 2);
  const geometry = mergeGeometries([card, cross])!;
  card.dispose();
  cross.dispose();
  return geometry;
}

export function makeTreeModel(name: string, atlas: THREE.Texture | null, billboard: THREE.Texture | null, light: CanopyLight) {
  const id: Species = name === 'tree_b' || name === 'tree_c' ? name : 'tree_a';
  const { height, aspect } = species[id];
  const size = new THREE.Vector2(height * aspect, height);
  const solid = new THREE.MeshLambertMaterial({map:atlas, alphaTest:0.36, side:THREE.DoubleSide});
  const sprays = treeGeometry(id,true);
  const proxy = treeGeometry(id,false);
  const plain = new THREE.MeshLambertMaterial({vertexColors:true});
  const leaves = new THREE.MeshLambertMaterial({map:billboard, alphaTest:0.38, side:THREE.DoubleSide});
  lightFoliage(solid, size, light, atlas ? 'sprays' : 'mesh');
  lightFoliage(plain, size, light, 'mesh');
  lightFoliage(leaves, size, light, 'card');
  const distant = crossedCard(size.x, height);

  const sprayCount = sprays.index!.count;
  const shadowCard = distant.clone();
  shadowCard.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(shadowCard.getAttribute('position').count * 3).fill(1), 3));
  const canopy = mergeGeometries([sprays, shadowCard])!;
  canopy.setDrawRange(0, sprayCount);
  sprays.dispose();
  shadowCard.dispose();
  return { canopy, sprayCount, solid, distant, leaves, proxy, plain, ready: Boolean(billboard), hasSprays: Boolean(atlas) };
}

// Cutouts work from the roadside. From far overhead use opaque, low-poly crowns
// instead, so canopies keep their footprint without rendering distant needles.
export class TreeCluster extends THREE.LOD {
  constructor(private readonly model: ReturnType<typeof makeTreeModel>, private readonly proxy: THREE.InstancedMesh) {
    super();
    this.add(proxy);
  }

  setShadowDetail(quality: Quality) {
    const near = this.levels[0].object as THREE.InstancedMesh;
    const { canopy, sprayCount, leaves } = this.model;
    // Medium draws the full needles in colour, but rasterizes their whole-tree
    // alpha silhouette into the moving shadow map. Both ranges share the existing mesh.
    near.onBeforeShadow = (_renderer, _object, _camera, _shadowCamera, _geometry, depth) => {
      if (quality === 'medium' && leaves.map && depth instanceof THREE.MeshDepthMaterial) {
        canopy.setDrawRange(sprayCount, canopy.index!.count - sprayCount);
        depth.map = leaves.map;
      }
    };
    near.onAfterShadow = () => { canopy.setDrawRange(0, sprayCount); };
  }

  override update(camera: THREE.Camera) {
    super.update(camera);
    const near = this.levels[0].object;
    const distant = this.levels[1].object;
    const lookingDown = Math.abs(camera.matrixWorld.elements[9]) > 0.75;
    this.proxy.visible = (near.visible && !this.model.hasSprays) ||
      (distant.visible && (!this.model.ready || lookingDown));
    if (this.proxy.visible) near.visible = distant.visible = false;
  }
}
