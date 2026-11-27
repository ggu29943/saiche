import { buildRearFascia } from './rear.mjs';
import { v3, mix, clamp, smooth, steps, profile, patch, bead } from './geometry.mjs';

// Each row specifies the design hardpoints in metres, from tail (-Z) to nose.
const designs = {
  hatch: {
    tailZ: -1.905, rearTipZ: -2.00263524, frontTipZ: 2.26055336, width: 1.80, height: 1.44, sill: .145,
    waistY: .98, axleY: .90, noseY: .75, bumperUpperY: .52, rakeDeg: 7,
    cabin: [-1.794,-1.68,.33,1.12], roofWidth:.62, roofCrown:.08, doorSplit:.46,
  },
  coupe: {
    tailZ: -1.895, rearTipZ: -2.10021687, frontTipZ: 2.34371090, width: 1.87, height: 1.30, sill: .115,
    waistY: .88, axleY: .72, noseY: .58, bumperUpperY: .36, rakeDeg: 18,
    cabin: [-1.44,-.68,.22,.84], roofWidth:.61, roofCrown:.062, doorSplit:.33,
  },
  rally: {
    tailZ: -2.20, rearTipZ: -2.32579708, frontTipZ: 2.33300185, width: 1.80, height: 1.47, sill: .185,
    waistY: 1.00, axleY: .86, noseY: .70, bumperUpperY: .48, rakeDeg: 8,
    cabin: [-1.54,-.94,.18,.93], roofWidth:.63, roofCrown:.075, doorSplit:.48,
  },
};

export function buildShell(body, cfg, m) {
  const f = designs[cfg.id];
  const { tailZ, frontTipZ, sill, noseY } = f;
  // Freeze the original longitudinal envelope at the splitter leading edge.
  // The upper bumper retreats from it along a constant-rake face.
  const rake = Math.tan(f.rakeDeg * Math.PI / 180);
  const noseZ = frontTipZ - .05 - (noseY - sill) * rake;
  const axle = (cfg.wheels[0].mount[2] - cfg.wheels[2].mount[2]) / 2;
  const radius = cfg.wheel.radius, opening = radius + (cfg.id === 'rally' ? .094 : .065);
  const coupe = cfg.id === 'coupe';
  const hatch = cfg.id === 'hatch';
  const bumperFloor = coupe ? .15 : sill;
  // Keep the tires centred in circular openings as the rear overhang shrinks.
  // Most rounding of the shorter bumper happens behind the rear wheel.
  const rearBlendLength = hatch ? .54 : coupe ? .52 : .68;
  const endBlend = z => z >= 0
    ? clamp((z - noseZ + .66) / .66)
    : clamp((tailZ - z + rearBlendLength) / rearBlendLength);
  const axleLobe = z => Math.exp(-(((Math.abs(z) - axle) / .54) ** 2));
  const arch = z => {
    const d = Math.abs(Math.abs(z) - axle) / opening;
    if (d >= 1) return f.sill;
    // The small straight legs reach the sill; the crown is a circular sweep.
    return f.sill + (radius - f.sill) * smooth((1 - d) / .045) + opening * Math.sqrt(1 - d * d);
  };
  const width = z => {
    const waist = coupe ? .087 : hatch ? .043 : .033;
    const tip = z > 0 ? (coupe ? .16 : .13) : (coupe ? .016 : hatch ? .079 : .062);
    const flare = coupe ? (z < 0 ? .030 : .019) * axleLobe(z) : 0;
    const aftWaist = coupe && z < 0 ? mix(waist, .022, smooth(endBlend(z))) : waist;
    const taper = z < 0 ? smooth(endBlend(z)) : endBlend(z) ** 2.1;
    return f.width / 2 - aftWaist * (1 - axleLobe(z)) + flare - tip * taper;
  };
  const setback = (z, u) => {
    // A rounded plan view. The tangent swings around to the flanks at either
    // corner instead of ending the face and bonnets on a rectangular cut.
    if (z < 0) {
      const corner = clamp((Math.abs(u) - .66) / .34);
      return -smooth(endBlend(z)) * (hatch ? .125 : .16) * (1-Math.sqrt(1-corner*corner));
    }
    const round = (1 - Math.sqrt(Math.max(.025, 1 - .975 * u * u))) / (1 - Math.sqrt(.025));
    const corner = hatch ? .26 : .29;
    return endBlend(z) ** 2 * corner * (.25 * u*u + .75 * round);
  };
  const beltLimit = coupe ? .86 : .925 / .955;
  const [backFoot,,,frontFoot] = f.cabin;
  const crown = (z, u) => {
    const a = Math.abs(u);
    // The paint ends 18 mm below the side glass at the weatherstrip.
    const atWaist = f.waistY - .018 + .018 * (beltLimit**2 - a*a)
      - .018 * smooth((a - beltLimit) / (1 - beltLimit));
    const aft = smooth((backFoot + .38 - z) / .38);
    if (aft > 0) {
      // A broad crown turns into the side. Carry this section through the
      // backlight sill so a sudden height change cannot pinch the C-pillar feet.
      const roll = .060 * (1-Math.sqrt(1-.965*a**6)) / (1-Math.sqrt(.035));
      const cross = f.waistY - .002 - .014*a*a - roll;
      const rear = smooth((backFoot-z) / (backFoot-tailZ));
      const form = hatch ? -.083 * smooth((backFoot+.38-z)/.47)
        : coupe ? -.016*smooth((backFoot-z)/.20) + .019*smooth((tailZ+.15-z)/.15)
        : -.041*rear;
      return mix(atWaist, cross, aft) + form;
    }
    if (z <= frontFoot) return atWaist;
    const fender = coupe ? .044 * smooth((a - .42) / .50) - .005 * smooth((a - .93) / .07)
      : .012 * a * Math.sin(Math.PI * a)**2 - .025 * a**4;
    return profile([[frontFoot - .1, atWaist], [frontFoot, atWaist], [axle, f.axleY + fender],
      [noseZ, noseY - .012*a*a - .011*a**8]], z);
  };
  const top = (z, u) => {
    const worldZ = z - setback(z,u);
    // Parameterize rear cross-sections at their actual Z. Sampling width at
    // the unrounded station folds the outer quarter back over itself.
    const station = z < 0 ? worldZ : z;
    return v3(u * width(station) * .955, crown(station,u), worldZ);
  };
  const backlightBow = hatch ? .071 : coupe ? .059 : .145;
  const beltZ = (u, t) => mix(f.cabin[0], f.cabin[3], t) + mix(-backlightBow,.145,t) * (1-u*u);
  const belt = (u, t) => top(beltZ(u,t), u*beltLimit);

  const bumperBelt = .40;
  // A quarter ellipse turns the deck into a broad, almost upright rump.
  // The old overall length is a hardpoint on the skin, independent of lamps.
  const rearDepth = t => {
    const depth = tailZ - f.rearTipZ;
    if (t < bumperBelt) return depth - .079 * ((bumperBelt - t) / bumperBelt) ** 2;
    const height = (t - bumperBelt) / (1 - bumperBelt);
    return depth * Math.sqrt(Math.max(0, 1 - height * height));
  };
  const side = (z, t, sign) => {
    const upper = top(z,sign);
    const roof = upper.y;
    const ground = Math.max(arch(z), mix(sill, bumperFloor, smooth(endBlend(z))));
    const y = mix(ground, roof, t);
    const h = roof - y;
    // Stamp highlights follow their physical height along the flank. They do
    // not rise and fall over the wheel cutouts when the panel gets narrower.
    const swell = .047 * (1 - Math.exp(-h / .063));
    const rocker = .065 * (1 - smooth((y - f.sill) / .27));
    const scoop = (coupe ? .045 : .028) * (1-axleLobe(z))
      * Math.exp(-(((y - .42 - .035*z) / .13) ** 2)) * (1-Math.exp(-h/.065));
    // A stamped flare follows the tyre arc rather than running straight
    // along the entire flank. Fade it into both the shoulder and the rocker.
    const archDistance = Math.hypot(Math.abs(z) - axle, y - radius) - opening;
    const archFlare = coupe ? .038 * Math.exp(-((archDistance - .07) ** 2) / .016)
      * (1 - Math.exp(-h / .045)) * smooth((y - f.sill) / .16) : 0;
    const blend = z < 0 ? smooth(endBlend(z)) : endBlend(z)**2;
    const x = Math.abs(upper.x) + (swell + archFlare - rocker * (z < 0 ? 1 - .72*blend : 1) - scoop) * (z > 0 ? 1 - blend : 1);
    const wrap = blend * (z > 0 ? (crown(noseZ,1) - bumperFloor) * (1 - t) * rake : -rearDepth(t));
    return v3(sign*x, y, upper.z + wrap);
  };
  const end = (front, u, t) => {
    const z = front ? noseZ : tailZ;
    const edge = side(z,t,1);
    const upper = top(z,u);
    const upperEdge = top(z,1);
    const y = mix(bumperFloor, upper.y, t);
    const x = upper.x + u*(edge.x-upperEdge.x);
    return v3(x,y,upper.z + (front ? (upper.y-y)*rake : -rearDepth(t)));
  };
  const wheelTub = (z, t, sign) => {
    const p = side(z, 0, sign);
    p.x = mix(p.x, sign * .47, t);
    if (coupe && z > 0) {
      // The low bonnet falls inboard of the arch. Tuck the liner under
      // that surface with clearance for its thickness, including at the axle.
      const panel = crown(z, Math.min(1, Math.abs(p.x) / (width(z)*.955)));
      p.y = Math.min(p.y, panel - .018 * smooth(t / .16));
    }
    p.y -= .013 * Math.sin(Math.PI * t);
    return p;
  };
  const rear = buildRearFascia(body,cfg.id,{ end, bumperBelt, bumperFloor, beltLimit },m);
  const raw = [backFoot,frontFoot, ...steps(82).map(t => mix(tailZ,noseZ,t))];
  for (const t of steps(18)) raw.push(mix(tailZ,backFoot,t));
  for (const axis of [-axle, axle]) {
    for (const t of steps(48)) raw.push(axis + opening * Math.cos(Math.PI * t));
  }
  const zs = [...new Set(raw.map(n => Number(n.toFixed(9))))].sort((a, b) => a - b);
  const topUs = steps(40).map(t => -Math.cos(Math.PI*t));
  // Cut a full opening outlined by the bases of the windshield, backlight
  // and side glazing. The cabin's inner trim uses this same belt function.
  for (const front of [false,true]) {
    const endZ = front ? noseZ : tailZ;
    const columns = front ? topUs : rear.deckUs.filter(u=>Math.abs(u)<=beltLimit).map(u=>u/beltLimit);
    const rows = front ? steps(56) : zs.filter(z=>z >= tailZ && z <= backFoot)
      .map(z=>(backFoot-z)/(backFoot-tailZ)).reverse();
    patch(body, front ? 'bonnet' : 'rear_deck', m.paint, columns, rows, (u,t) => {
      const cowl = beltZ(u, front ? 1 : 0);
      const z = front ? (t < .5 ? mix(cowl, axle, 2*t) : mix(axle, endZ, 2*t-1)) : mix(cowl, endZ, t);
      return top(z, u*beltLimit);
    }, v3(0,1,0));
  }
  for (const sign of [-1, 1]) {
    const shoulder = rear.deckUs.filter(u=>u*sign>=beltLimit).map(Math.abs).sort((a,b)=>a-b);
    patch(body, 'outer_fender_shoulders', m.paint, shoulder, zs,
      (u,z) => top(z,sign*u), v3(0,1,0));
    patch(body, 'pressed_flanks', m.paint, zs, rear.sideRows, (z, h) => side(z, h, sign), v3(sign,0,0));
    // Inner wheel tubs follow the actual arch opening and continue behind each tire.
    patch(body, 'inner_sill_and_wheel_tubs', m.rubber, zs, steps(coupe ? 8 : 3),
      (z, t) => wheelTub(z,t,sign), v3(0,-1,0));
    for (const a of [-axle, axle]) {
      const archZ = steps(48).map(t => a - opening * Math.cos(Math.PI * t));
      // Close the inboard wall between the arch liner and undertray, so the
      // background cannot show through the wheel from a side-on view.
      patch(body, 'wheelhouse_inner_wall', m.rubber, archZ, [0,1], (z,h) => {
        const p = wheelTub(z,1,sign);
        p.y = mix(sill,p.y,h);
        return p;
      },v3(sign,0,0));
      patch(body, 'rolled_arch_lip', cfg.id === 'rally' ? m.dark : m.paint, archZ, steps(4), (z, h) => {
        const p = side(z, 0, sign);
        const angle = Math.acos(Math.max(-1, Math.min(1,(z-a)/opening)));
        const band = cfg.id === 'rally' ? .039 : coupe ? (a > 0 ? .019 : .048) : .024;
        if (coupe) {
          const newZ = z + h * band * Math.cos(angle);
          const newY = p.y + h * band * Math.sin(angle);
          const lower = arch(newZ);
          const ratio = clamp((newY - lower) / (crown(newZ,1) - lower));
          const lip = side(newZ, ratio, sign);
          lip.x += sign * (.002 + .009 * Math.sin(Math.PI * h));
          return lip;
        }
        p.z += h * band * Math.cos(angle);
        p.y += h * band * Math.sin(angle);
        p.x += sign * (.005 + .009 * Math.sin(Math.PI * h));
        return p;
      }, v3(sign, .1, 0));
    }
    const outer = z => { const p = side(z, .035, sign); p.x += sign*.006; return p; };
    bead(body, 'sill_blade', m.dark, steps(18).map(t=>outer(mix(-axle+opening+.025,axle-opening-.025,t))), .019,8);
  }
  const bumperSeam = u => (f.bumperUpperY - bumperFloor) / (crown(noseZ,u) - bumperFloor);
  patch(body, 'front_bumper', m.paint, topUs, steps(12),
    (u,v)=>end(true,u,v*bumperSeam(u)), v3(0,0,1));
  patch(body, 'front_upper_fascia', m.paint, topUs, steps(8),
    (u,v)=>end(true,u,mix(bumperSeam(u),1,v)), v3(0,0,1));
  patch(body, 'undertray', m.dark, [-1,1], [tailZ,noseZ], (u,z)=>v3(.47*u,f.sill,z),v3(0,-1,0));
  smoothQuarterSeams(body,backFoot+.2);
  return { ...f, noseZ, axle, opening, side, top, end, width, belt, bumperSeam, bumperFloor, bumperBelt };
}

// Blend shading only across coincident body-panel vertices. Keep the optical
// apertures, wheel arches, glass and door seals as distinct material boundaries.
function smoothQuarterSeams(body, frontLimit) {
  const panels = new Set(['rear_bumper','lower_valance','rear_deck','outer_fender_shoulders','pressed_flanks']);
  const joins = new Map();
  for (const part of body.children) {
    if (!panels.has(part.name)) continue;
    const pos = part.geometry.getAttribute('position'), normals = part.geometry.getAttribute('normal');
    for (let i=0; i<pos.count; i++) {
      if (pos.getZ(i)>frontLimit) continue;
      const key = [pos.getX(i),pos.getY(i),pos.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
      let group = joins.get(key);
      if (!group) joins.set(key,group=[]);
      group.push([normals,i]);
    }
  }
  for (const join of joins.values()) {
    if (join.length < 2) continue;
    const average = v3(0,0,0);
    for (const [normals,i] of join) average.add(v3(normals.getX(i),normals.getY(i),normals.getZ(i)));
    average.normalize();
    for (const [normals,i] of join) normals.setXYZ(i,average.x,average.y,average.z);
  }
}
