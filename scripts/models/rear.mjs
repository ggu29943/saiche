import { clamp, mix, patch, smooth, steps, v3 } from './geometry.mjs';

// Optical apertures are dimensioned in metres on the rear elevation.
const optics = {
  hatch: { center: .536, width: .350, height: .080, y: .704, radius: .018 },
  rally: { center: .535, width: .300, height: .100, y: .755, radius: .021 },
  coupe: { center: 0, width: 1.70, height: .065, y: .69, radius: .018 },
};

export function buildRearFascia(body, id, shell, m) {
  const design = optics[id];
  const continuous = id === 'coupe';
  const at = (u, t) => shell.end(false, u, t);
  const fraction = (u, y) => (y - shell.bumperFloor) / (at(u, 1).y - shell.bumperFloor);
  const axisY = x => design.y + (continuous ? .023 * (Math.abs(x) / .85)**3
    : .007 * clamp((Math.abs(x) - design.center + design.width/2) / design.width));
  // Solve the tapered fascia's width at each lamp endpoint, not at the sill.
  function uToX(u) {
    let x = at(u,.75).x;
    for (let i=0; i<3; i++) x = at(u,fraction(u,axisY(x))).x;
    return x;
  }
  function coordinate(x) {
    let lo=-1, hi=1;
    for (let i=0; i<28; i++) {
      const u=(lo+hi)/2;
      if (uToX(u)<x) lo=u;
      else hi=u;
    }
    return (lo+hi)/2;
  }
  const spans = (continuous ? [0] : [-design.center, design.center]).map(center => ({
    lo: center - design.width/2, hi: center + design.width/2,
  }));
  const faceNormal = (u,t) => {
    const du = at(Math.min(1,u+.0001),t).sub(at(Math.max(-1,u-.0001),t));
    const dv = at(u,Math.min(1,t+.0001)).sub(at(u,Math.max(0,t-.0001)));
    return dv.cross(du).normalize();
  };
  const sideRows = new Set([0,1]), deckUs = new Set([-1,0,1]);
  const cuts = [-1, -shell.beltLimit, 0, shell.beltLimit, 1];
  for (const t of steps(9)) {
    const u = .66 + .34*Math.sin(t*Math.PI/2);
    cuts.push(-u,u);
  }
  for (const { lo, hi } of spans) {
    for (const extent of [0, .004, .012, design.radius]) cuts.push(coordinate(lo+extent), coordinate(hi-extent));
  }
  if (continuous) cuts.push(coordinate(-.41), coordinate(.41));
  const stations = [...new Set(cuts)].sort((a,b) => a-b);
  for (let j=1; j<stations.length; j++) {
    const left = stations[j-1], right = stations[j], mid = uToX((left+right)/2);
    const span = spans.find(s => mid >= s.lo && mid <= s.hi);
    const nearest = span ?? (mid < 0 ? spans[0] : spans.at(-1));
    const edgeDistance = u => Math.min(uToX(u) - nearest.lo, nearest.hi - uToX(u));
    const sections = steps(Math.max(1, Math.ceil((right-left) * 34))).map(t => mix(left,right,t));
    function bounds(u) {
      const edge = clamp(edgeDistance(u) / design.radius);
      const round = design.radius * (1-Math.sqrt(Math.max(0,1-(1-edge)**2)));
      const half = design.height/2 - round, center = axisY(uToX(u));
      return [fraction(u,center-half), fraction(u,center+half)];
    }
    function band(name, material, rows, height, offset) {
      // The quarter panel and deck reuse these exact boundary vertices. Different
      // subdivisions of a rounded edge leave a slit between two otherwise matching panels.
      for (const u of sections) {
        if (Math.abs(u) === 1) for (const s of rows) sideRows.add(height(u,s));
        if (height(u,rows.at(-1)) === 1) deckUs.add(u);
      }
      const surface = patch(body,name,material,sections,rows,(u,s) => {
        const t = height(u,s), p = at(u,t);
        return offset ? p.addScaledVector(faceNormal(u,t), offset(u,s,t)) : p;
      },v3(0,0,-1));
      // Use the continuous skin normal across material and tessellation boundaries.
      const normals = surface.geometry.getAttribute('normal');
      let i=0;
      for (const s of rows) for (const u of sections) {
        const n = faceNormal(u,height(u,s));
        normals.setXYZ(i++,n.x,n.y,n.z);
      }
    }
    const lowerTrim = u => .17 * (1-smooth((Math.abs(u)-.66)/.27));
    band('lower_valance',m.dark,steps(3),(u,s)=>s*lowerTrim(u));
    band('rear_bumper',m.paint,steps(6),(u,s)=>mix(lowerTrim(u),shell.bumperBelt,s));
    band('rear_bumper',m.paint,steps(7),(u,s)=>mix(shell.bumperBelt,bounds(u)[0],s));
    band('rear_bumper',m.paint,steps(12),(u,s)=>mix(bounds(u)[1],1,Math.sin(s*Math.PI/2)));
    const inAperture = (u,s) => { const [lo,hi] = bounds(u); return mix(lo,hi,s); };
    if (!span) {
      band('rear_bumper',m.paint,steps(4),inAperture);
      continue;
    }
    // No paint triangles span the aperture. The seal dips into the actual hole,
    // then rises to the optical surface. There is no stacked housing or cover.
    const depth = (u,s,t) => {
      const [bottom,top] = bounds(u);
      const dist = Math.min(edgeDistance(u), (at(u,1).y-shell.bumperFloor)*Math.min(t-bottom,top-t));
      return -.0035*smooth(dist/.004) + .0055*smooth((dist-.004)/.009);
    };
    const endSeal = Math.min(mid-span.lo,span.hi-mid) < .004;
    const stop = !continuous || Math.abs(mid) > .41;
    const zones = [[0,.055,m.rubber],[.055,.20,m.redLens],[.20,.50,stop?m.light_brake:m.redLens],
      [.50,.64,m.redLens],[.64,.82,m.light_tail],[.82,.945,m.redLens],[.945,1,m.rubber]];
    for (const [from,to,mat] of zones) {
      const material = endSeal ? m.rubber : mat;
      band('inlaid_rear_optic',material,steps(2).map(v=>mix(from,to,v)),inAperture,depth);
    }
  }
  return { sideRows: [...sideRows].sort((a,b)=>a-b), deckUs: [...deckUs].sort((a,b)=>a-b) };
}
