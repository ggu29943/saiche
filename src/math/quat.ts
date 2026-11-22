import { add, cross, mul, type V3 } from './vec3';
export type Q = [number, number, number, number];
export function qMul([w,x,y,z]: Q, [bw,bx,by,bz]: Q): Q {
  return [w*bw-x*bx-y*by-z*bz, w*bx+x*bw+y*bz-z*by,
    w*by-x*bz+y*bw+z*bx, w*bz+x*by-y*bx+z*bw];
}
export function qRot([w,x,y,z]: Q, v: V3): V3 {
  const u: V3 = [x,y,z];
  const t = mul(cross(u,v),2);
  return add(add(v,mul(t,w)),cross(u,t));
}
export function qInvRot([w,x,y,z]: Q, v: V3) { return qRot([w,-x,-y,-z],v); }
export function qNorm([w,x,y,z]: Q): Q {
  const length = Math.sqrt(w*w+x*x+y*y+z*z);
  return [w/length,x/length,y/length,z/length];
}
export function qFromYaw(yaw: number): Q { return [Math.cos(yaw/2),0,Math.sin(yaw/2),0]; }
