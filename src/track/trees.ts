import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '@/math/rng';

type Point = [number, number, number];
type Patch = [number, number, number, number];

// The spray atlas uses a 2x2 layout: three branch cutouts, then bark.
// Distant cutouts retain the aspect ratio of the original whole-tree photos.
const species = {
  tree_a: { height: 9.5, aspect: 389/695, foliage: [0.013, 0.515, 0.487, 0.985], green: '#456143' },
  tree_b: { height: 9.0, aspect: 639/680, foliage: [0.513, 0.515, 0.987, 0.985], green: '#51633F' },
  tree_c: { height: 7.6, aspect: 885/663, foliage: [0.013, 0.015, 0.487, 0.485], green: '#5B663C' },
} satisfies Record<string, {height: number; aspect: number; foliage: Patch; green: string}>;
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
function crown(center: Point, rx: number, rz: number, depth: number, spruce: boolean, rng: () => number) {
  const sides = spruce ? 10 : 8;
  const phase = rng() * Math.PI;
  const points: number[] = [], uv: number[] = [], indices: number[] = [];
  const ridge = Array.from({length:sides}, (_, i) => 0.80 + 0.20*rng() + (spruce && i%2 === 0 ? 0.24 : 0));
  const ring = (scale: number, rise: number) => {
    for (let i = 0; i < sides; i++) {
      const angle = phase + 2*Math.PI*i/sides;
      const x = scale * ridge[i] * Math.cos(angle), z = scale * ridge[i] * Math.sin(angle);
      points.push(center[0] + rx*x, center[1] + depth*(rise + 0.16*rng()), center[2] + rz*z);
      uv.push(0.5 + x*0.40, 0.45 + rise*0.25 + z*0.15);
    }
  };
  ring(0.20, -0.33);
  ring(1.00, spruce ? -0.18 : 0);
  ring(spruce ? 0.33 : 0.68, 0.60);
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

function addWhorl(add: (g: THREE.BufferGeometry) => void, y: number, radius: number, tier: number, rng: () => number) {
  const count = 8;
  const phase = tier*2.39996;
  for (let i = 0; i < count; i++) {
    const direction = phase + (i + rng()*0.34)*2*Math.PI/count;
    const reach = radius*(0.87+0.25*rng());
    const height = 0.42+radius*0.58;
    const lift = y + (rng()-0.5)*0.4;
    // The cutout tapers toward its left side. Mount its right end at
    // the trunk; two half-sprays fan out from one branch crotch.
    for (const side of [-1,1]) {
      const g = sprayCard(reach,height,side*reach*0.19,height*0.12,side*height*0.20);
      g.translate(-reach*0.55,lift,side*0.08*reach);
      g.rotateY(direction + side*0.17);
      add(g);
    }
  }
}

function addCloud(add: (g: THREE.BufferGeometry) => void, center: Point, radius: number, umbrella: boolean, rng: () => number) {
  // Each woody stem ends at the centre of this cluster. Attach the cut end
  // of each spray there and let its needles point out and up into the light.
  const phase = rng() * 2 * Math.PI;
  for (let i = 0; i < 12; i++) {
    const upright = i >= 8;
    const reach = radius * (upright ? 0.63 : 1.05) * (0.85 + 0.28 * rng());
    const height = reach * (umbrella ? 0.58 : 0.76);
    const spray = sprayCard(reach, height, reach * (rng() - 0.5) * 0.29, 0, 0);
    spray.translate(-reach / 2, 0, 0);
    spray.rotateX((rng() - 0.5) * 1.55);
    spray.rotateZ(-(upright ? 0.68 : 0.10) - rng() * (umbrella ? 0.27 : 0.48));
    spray.rotateY(phase + i * 2.39996);
    add(spray.translate(...center));
  }
}

function treeGeometry(id: Species, withSprays: boolean) {
  const form = species[id];
  const rng = mulberry32(id === 'tree_a' ? 317 : id === 'tree_b' ? 521 : 733);
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

  if (id === 'tree_a') {
    add(branch([0,0,0],[0,8.9,0],0.20,0.04),true);
    if (withSprays) {
      for (let i = 0; i < 10; i++) {
        const t = i/10;
        addWhorl(add,1.9+i*0.79,2.55*(1-t)**0.83,i,rng);
      }
    } else for (let i = 0; i < 6; i++) {
      const radius = 2.5 - i*0.39;
      add(crown([0,1.65+i*1.24,0],radius,radius*0.92,1.65,true,rng));
    }
  } else {
    const windswept = id === 'tree_c';
    const fork: Point = [windswept ? -0.36 : 0.05, form.height*(windswept ? 0.42 : 0.48), 0];
    add(branch([0,0,0],fork,0.23,0.15),true);
    const leader: Point = [fork[0] + (windswept ? 0.63 : -0.12), form.height * 0.72, 0.18];
    add(branch(fork, leader, 0.16, 0.075), true);
    const count = windswept ? 6 : 7;
    for (let i = 0; i < count; i++) {
      const t = i/(count-1);
      const a = i*2.39996;
      const reach = windswept ? (1-t)*3.35 : (1-t)*2.75;
      const x = Math.cos(a)*reach + (windswept ? 1.05 : 0);
      const z = Math.sin(a)*reach;
      const y = form.height * ((windswept ? 0.74 : 0.54) + t*(windswept ? 0.15 : 0.35));
      const joint: Point = [
        THREE.MathUtils.lerp(fork[0], leader[0], t),
        THREE.MathUtils.lerp(fork[1], leader[1], t),
        THREE.MathUtils.lerp(fork[2], leader[2], t),
      ];
      const elbow: Point = [joint[0] + 0.37*(x-joint[0]), (joint[1]+y)/2, z*0.31];
      add(branch(joint,elbow,0.12,0.08),true);
      add(branch(elbow,[x,y,z],0.084,0.035),true);
      const radius = (windswept ? 2.35 : 1.78) * (1-0.18*t);
      if (withSprays) addCloud(add,[x,y,z],radius,windswept,rng);
      else add(crown([x,y,z],radius,radius*0.84,form.height*0.11,false,rng));
    }
  }
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return geometry;
}

export function loadTreeSprays() {
  return new THREE.TextureLoader().loadAsync(import.meta.env.BASE_URL+'assets/scenery/tree_sprays.png')
    .then(texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }).catch(() => null);
}

export function makeTreeModel(name: string, sprays = loadTreeSprays()) {
  const id: Species = name === 'tree_b' || name === 'tree_c' ? name : 'tree_a';
  const { height, aspect } = species[id];
  const solid = new THREE.MeshLambertMaterial({alphaTest:0.36, side:THREE.DoubleSide});
  const canopy = treeGeometry(id,true);
  const proxy = treeGeometry(id,false);
  const plain = new THREE.MeshLambertMaterial({vertexColors:true});
  const leaves = new THREE.MeshBasicMaterial({alphaTest:0.38, side:THREE.DoubleSide});
  const card = new THREE.PlaneGeometry(height*aspect,height).translate(0,height/2,0);
  const cross = card.clone().rotateY(Math.PI/2);
  const distant = mergeGeometries([card,cross])!;
  card.dispose();
  cross.dispose();

  const model = { canopy, solid, distant, leaves, proxy, plain, ready:false, hasSprays:false };
  void sprays.then(atlas => {
    if (!atlas) return;
    solid.map = atlas;
    // Needles scatter a little skylight through the back of the branch.
    solid.emissive.setHex(0xffffff);
    solid.emissiveMap = atlas;
    solid.emissiveIntensity = 0.12;
    solid.needsUpdate = true;
    model.hasSprays = true;
  });
  new THREE.TextureLoader().load(import.meta.env.BASE_URL+'assets/scenery/'+id+'.png', texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    leaves.map = texture;
    leaves.needsUpdate = true;
    model.ready = true;
  });
  return model;
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
