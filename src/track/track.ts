import { clamp, pmod, wrapAngle } from '@/math/scalar';
import { norm, sub, type V3 } from '@/math/vec3';
import type { GroundHit } from '@/physics/types';
import type { Projection, TrackData } from './types';
export type { ControlPoint, Projection, TrackData } from './types';

export const DENSE_PER_SEGMENT = 200;
export const SAMPLE_STEP = 2;
export const CELL = 25;
export const KERB_WIDTH = 1;
export const KERB_CURVATURE = 1 / 150;
export const DRAIN_SLOPE = 0.02;

function distance(a: number[], b: number[]) {
  return Math.sqrt((b[0]-a[0])**2 + (b[1]-a[1])**2 + (b[2]-a[2])**2);
}
function tj(ti: number, a: number[], b: number[]) {
  return ti + Math.sqrt(Math.max(distance(a,b), 1e-6));
}
function lerpN(a: number[], b: number[], wa: number, wb: number) {
  return a.map((v,i) => v * wa + b[i] * wb);
}
function catmullRom(p0: number[], p1: number[], p2: number[], p3: number[], n: number) {
  const t0 = 0, t1 = tj(t0,p0,p1), t2 = tj(t1,p1,p2), t3 = tj(t2,p2,p3);
  const points: number[][] = [];
  for (let k=0; k<n; k++) {
    const t = t1 + (t2-t1)*k/n;
    const interpolate = (a: number[], b: number[], from: number, to: number) =>
      lerpN(a,b,(to-t)/(to-from),(t-from)/(to-from));
    const a1 = interpolate(p0,p1,t0,t1), a2 = interpolate(p1,p2,t1,t2), a3 = interpolate(p2,p3,t2,t3);
    const b1 = interpolate(a1,a2,t0,t2), b2 = interpolate(a2,a3,t1,t3);
    points.push(interpolate(b1,b2,t1,t2));
  }
  return points;
}

export class Track {
  readonly length: number;
  readonly count: number;
  readonly step: number;
  readonly pos: V3[] = [];
  readonly tan: V3[] = [];
  readonly left: V3[] = [];
  readonly hw: number[] = [];
  readonly bank: number[] = [];
  readonly s: number[] = [];
  readonly curv: number[] = [];
  readonly kerb: boolean[] = [];
  private grid = new Map<string,number[]>();
  private mapScale = 1;
  private mapOffsetX = 0;
  private mapOffsetY = 0;

  constructor(readonly data: TrackData) {
    const cps = data.controlPoints.map(p => [p.x,p.y,p.z,p.halfWidth,p.bankDeg]);
    const dense: number[][] = [];
    const cp = (i: number) => cps[pmod(i,cps.length)];
    for (let i=0; i<cps.length; i++)
      dense.push(...catmullRom(cp(i-1),cp(i),cp(i+1),cp(i+2),DENSE_PER_SEGMENT));
    dense.push(dense[0]);
    const cum = [0];
    for (let i=1; i<dense.length; i++) cum.push(cum[i-1] + distance(dense[i-1],dense[i]));
    this.length = cum[cum.length-1];
    this.count = Math.round(this.length/SAMPLE_STEP);
    this.step = this.length/this.count;
    let j = 0;
    for (let i=0; i<this.count; i++) {
      const s = i*this.step;
      while (cum[j+1] < s) j++;
      const f = (s-cum[j])/(cum[j+1]-cum[j]);
      const [x,y,z,width,bank] = lerpN(dense[j],dense[j+1],1-f,f);
      this.pos.push([x,y,z]);
      this.hw.push(width);
      this.bank.push(bank*Math.PI/180);
      this.s.push(s);
    }
    for (let i=0; i<this.count; i++) {
      const t = norm(sub(this.pos[pmod(i+1,this.count)], this.pos[pmod(i-1,this.count)]));
      this.tan.push(t);
      const h = Math.sqrt(t[0]**2+t[2]**2);
      this.left.push([t[2]/h,0,-t[0]/h]);
    }
    const heading = (i: number) => {
      const t = this.tan[pmod(i,this.count)];
      return Math.atan2(t[0],t[2]);
    };
    const raw = this.tan.map((_,i) => wrapAngle(heading(i+1)-heading(i-1))/(2*this.step));
    for (let i=0; i<this.count; i++) {
      let sum = 0;
      for (let k=-4; k<=4; k++) sum += raw[pmod(i+k,this.count)];
      this.curv.push(sum/9);
      this.kerb.push(Math.abs(this.curv[i]) > KERB_CURVATURE);
      const [x,,z] = this.pos[i];
      const key = Math.floor(x/CELL)+','+Math.floor(z/CELL);
      const cell = this.grid.get(key);
      if (cell) cell.push(i);
      else this.grid.set(key,[i]);
    }
  }

  runoffSurface(s: number) {
    return this.data.runoffOverrides.find(o => o.from<=s && s<=o.to)?.surface ?? this.data.runoffSurface;
  }
  nearestIndex(x: number, z: number) {
    const cx = Math.floor(x/CELL), cz = Math.floor(z/CELL);
    let best = 1e18, index = -1;
    for (let dx=-1; dx<=1; dx++) {
      for (let dz=-1; dz<=1; dz++) {
        const cell = this.grid.get((cx+dx)+','+(cz+dz));
        if (!cell) continue;
        for (const i of cell) {
          const p = this.pos[i];
          const d = (p[0]-x)**2 + (p[2]-z)**2;
          if (d<best || (d===best && i<index)) { best=d; index=i; }
        }
      }
    }
    return index;
  }
  leftAt({a,f}: Pick<Projection,'a'|'f'>): V3 {
    const b = pmod(a+1,this.count);
    return norm([this.left[a][0]*(1-f)+this.left[b][0]*f, 0, this.left[a][2]*(1-f)+this.left[b][2]*f]);
  }
  project(x: number,z: number): Projection | null {
    const i = this.nearestIndex(x,z);
    if (i<0) return null;
    let best = Infinity, a = 0, f = 0;
    for (const from of [pmod(i-1,this.count),i]) {
      const A = this.pos[from], B = this.pos[pmod(from+1,this.count)];
      const ex = B[0]-A[0], ez = B[2]-A[2];
      const fraction = clamp(((x-A[0])*ex+(z-A[2])*ez)/(ex*ex+ez*ez),0,1);
      const d2 = (x-(A[0]+ex*fraction))**2+(z-(A[2]+ez*fraction))**2;
      if (d2<best) { best=d2; a=from; f=fraction; }
    }
    const b = pmod(a+1,this.count), P = lerpN(this.pos[a],this.pos[b],1-f,f);
    const L = this.leftAt({a,f});
    return {
      a, f, s:pmod(this.s[a]+f*this.step,this.length), d:(x-P[0])*L[0]+(z-P[2])*L[2],
      yc:P[1], hw:this.hw[a]*(1-f)+this.hw[b]*f, bank:this.bank[a]*(1-f)+this.bank[b]*f,
      kerb:this.kerb[a] || this.kerb[b],
    };
  }
  private projectedHeight(p: Projection) {
    return p.yc + clamp(p.d,-p.hw,p.hw)*Math.tan(p.bank) - Math.max(0,Math.abs(p.d)-p.hw)*DRAIN_SLOPE;
  }
  height(x: number,z: number) {
    const p = this.project(x,z);
    return p ? this.projectedHeight(p) : null;
  }
  heightOrEdge(x: number,z: number) {
    const h = this.height(x,z);
    if (h !== null) return h;
    // 规格未指定：查询网格外返回最近路肩外缘高度。
    let best = Infinity, index = 0;
    for (let i=0; i<this.count; i++) {
      const p = this.pos[i], d2 = (x-p[0])**2+(z-p[2])**2;
      if (d2<best) {best=d2; index=i;}
    }
    const t = this.data.terrain;
    return this.pos[index][1] - t.vergeDrop - (this.data.runoffWidth+t.vergeWidth)*DRAIN_SLOPE;
  }
  query = (x: number,z: number): GroundHit => {
    const p = this.project(x,z);
    if (!p) return {height:0, normal:[0,1,0], surface:'grass'};
    const height = this.projectedHeight(p), e=0.25;
    const dx = ((this.height(x+e,z) ?? height)-(this.height(x-e,z) ?? height))/(2*e);
    const dz = ((this.height(x,z+e) ?? height)-(this.height(x,z-e) ?? height))/(2*e);
    const ad = Math.abs(p.d);
    const surface = ad<=p.hw ? 'asphalt' : ad<=p.hw+KERB_WIDTH && p.kerb ? 'kerb' : this.runoffSurface(p.s);
    return {height, normal:norm([-dx,1,-dz]), surface};
  };
  barrierOffset(i: number) { return this.hw[i]+this.data.runoffWidth; }
  minimapPoint(x: number,z: number): [number,number] {
    return [this.mapOffsetX+x*this.mapScale, this.mapOffsetY-z*this.mapScale];
  }
  minimapPath(size: number, padding: number) {
    const xs = this.pos.map(p=>p[0]), zs = this.pos.map(p=>p[2]);
    const xMin = Math.min(...xs), xMax = Math.max(...xs), zMin = Math.min(...zs), zMax = Math.max(...zs);
    this.mapScale = (size-2*padding)/Math.max(xMax-xMin,zMax-zMin);
    this.mapOffsetX = (size-(xMin+xMax)*this.mapScale)/2;
    this.mapOffsetY = (size+(zMin+zMax)*this.mapScale)/2;
    return this.pos.map(([x,,z],i) => {
      const [px,py] = this.minimapPoint(x,z);
      return (i?'L ':'M ')+px.toFixed(1)+' '+py.toFixed(1);
    }).join(' ')+' Z';
  }
}
