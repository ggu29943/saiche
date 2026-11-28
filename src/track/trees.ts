import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '@/math/rng';

type Point = [number, number, number];
type Patch = [number, number, number, number];

// The spray atlas uses a 2x2 layout: three branch cutouts, then bark.
// Dimensions pair each near model with its corresponding whole-tree cutout.
const species = {
  tree_a: { height: 9.5, aspect: 389/695, base: 1.8, tiers: 10, boughs: 8, seed: 317,
    foliage: [0.013, 0.515, 0.487, 0.985], green: '#456143' },
  tree_b: { height: 11.6, aspect: 412/695, base: 1.45, tiers: 13, boughs: 6, seed: 521,
    foliage: [0.513, 0.515, 0.987, 0.985], green: '#48695C' },
  tree_c: { height: 8.8, aspect: 441/695, base: 1.7, tiers: 9, boughs: 7, seed: 733,
    foliage: [0.013, 0.015, 0.487, 0.485], green: '#4A6244' },
} satisfies Record<string, { height: number; aspect: number; base: number; tiers: number;
  boughs: number; seed: number; foliage: Patch; green: string }>;
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

function sprayCard(width: number, height: number, bend: number, slope: number, twist: number) {
  // Give each spray a curved midsurface. Its outer edge is lowered and swept
  // back, so the branch stays visible as the driver passes it or looks down.
  const geometry = new THREE.PlaneGeometry(width, height, 2, 1);
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
  add(branch([0, 0, 0], [0, height, 0], 0.20, 0.012), true);
  const tierSpacing = (height - base) / tiers;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const y = base + t * (height - base);
    const radius = height * aspect * 0.49 * (1 - t) ** (id === 'tree_c' ? 0.76 : 0.92);
    if (withSprays) {
      addWhorl(id, add, y, radius, i, rng);
    } else {
      // Solid whorls keep the same taper in overhead views and without PNGs.
      add(crown([0, y, 0], radius, radius * 0.94, tierSpacing * 1.18, rng));
    }
  }
  if (withSprays) {
    // A short terminal shoot carries the silhouette through the topmost gaps.
    const shoot = height / 12;
    for (let i = 0; i < 3; i++) {
      const tip = sprayCard(shoot, shoot * 0.45, 0, 0, 0);
      tip.translate(-shoot / 2, 0, 0);
      tip.rotateZ(-1.40);
      tip.rotateY(i * Math.PI * 2 / 3);
      add(tip.translate(0, height - shoot, 0));
    }
  }
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return geometry;
}

export function makeTreeModel(name: string, atlas: THREE.Texture | null, billboard: THREE.Texture | null) {
  const id: Species = name === 'tree_b' || name === 'tree_c' ? name : 'tree_a';
  const { height, aspect } = species[id];
  const solid = new THREE.MeshLambertMaterial({map:atlas, alphaTest:0.36, side:THREE.DoubleSide});
  const canopy = treeGeometry(id,true);
  const proxy = treeGeometry(id,false);
  const plain = new THREE.MeshLambertMaterial({vertexColors:true});
  const leaves = new THREE.MeshLambertMaterial({map:billboard, alphaTest:0.38, side:THREE.DoubleSide});
  const card = new THREE.PlaneGeometry(height*aspect,height).translate(0,height/2,0);
  const cross = card.clone().rotateY(Math.PI/2);
  const distant = mergeGeometries([card,cross])!;
  card.dispose();
  cross.dispose();

  return { canopy, solid, distant, leaves, proxy, plain, ready: Boolean(billboard), hasSprays: Boolean(atlas) };
}

// Cutouts work from the roadside. From far overhead use opaque, low-poly crowns
// instead, so canopies keep their footprint without rendering distant needles.
export class TreeCluster extends THREE.LOD {
  constructor(private readonly model: ReturnType<typeof makeTreeModel>, private readonly proxy: THREE.InstancedMesh) {
    super();
    this.add(proxy);
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
