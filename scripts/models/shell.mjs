import { v3, mix, clamp, smooth, steps, profile, patch, bead } from './geometry.mjs';

// Each row specifies the design hardpoints in metres, from tail (-Z) to nose.
const designs = {
  hatch: {
    tailZ: -1.88, frontTipZ: 2.26055336, width: 1.80, height: 1.44, sill: .145,
    waistY: .98, axleY: .90, noseY: .75, bumperUpperY: .52, rakeDeg: 7,
    rearDeck: [[-1.88,.82],[-1.68,.89],[-1.35,.94]],
    cabin: [-1.81,-1.68,.33,1.12], roofWidth:.62, roofCrown:.08, doorSplit:.46,
  },
  coupe: {
    tailZ: -1.965, frontTipZ: 2.34371090, width: 1.87, height: 1.30, sill: .115,
    waistY: .88, axleY: .72, noseY: .58, bumperUpperY: .36, rakeDeg: 18,
    rearDeck: [[-1.965,.602],[-1.78,.674],[-1.56,.77],[-1.26,.814]],
    cabin: [-1.59,-.83,.07,.69], roofWidth:.61, roofCrown:.062, doorSplit:.33,
  },
  rally: {
    tailZ: -2.20, frontTipZ: 2.33300185, width: 1.80, height: 1.47, sill: .185,
    waistY: 1.00, axleY: .86, noseY: .70, bumperUpperY: .48, rakeDeg: 8,
    rearDeck: [[-2.20,.82],[-1.85,.9],[-1.30,.92]],
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
  // Keep the tires centred in circular openings as the rear overhang shrinks.
  // Most rounding of the shorter bumper happens behind the rear wheel.
  const rearBlendLength = hatch ? .34 : coupe ? .38 : .66;
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
    const tip = z > 0 ? (coupe ? .16 : .13) : (hatch ? .14 : .11);
    const flare = coupe ? (z < 0 ? .030 : .019) * axleLobe(z) : 0;
    return f.width / 2 - waist * (1 - axleLobe(z)) + flare - tip * endBlend(z) ** 2.1;
  };
  const setback = (z, u) => {
    // A rounded plan view. The tangent swings around to the flanks at either
    // corner instead of ending the face and bonnets on a rectangular cut.
    const round = (1 - Math.sqrt(Math.max(.025, 1 - .975 * u * u))) / (1 - Math.sqrt(.025));
    const corner = z > 0 ? (hatch ? .26 : .29) : (hatch ? .105 : coupe ? .13 : .20);
    return Math.sign(z) * endBlend(z) ** 2 * corner * (.25 * u*u + .75 * round);
  };
  const beltLimit = coupe ? .86 : .925 / .955;
  const [backFoot,,,frontFoot] = f.cabin;
  const rearShoulder = (z, a) => {
    const shoulder = clamp((a - .69) / .31);
    const rounding = (1 - Math.sqrt(1 - .97 * shoulder * shoulder)) / (1 - Math.sqrt(.03));
    const muscle = Math.exp(-(((a - .78) / .20) ** 2)) * axleLobe(z);
    const spine = (coupe ? .068 : .043) * a*a;
    return profile(f.rearDeck, z) - spine - (hatch ? .098 : .085) * rounding
      + muscle * (coupe ? .137 : hatch ? .055 : .045)
      + (coupe ? .13 : .021) * axleLobe(z) * a**4;
  };
  const crown = (z, u) => {
    const a = Math.abs(u);
    // The paint ends 18 mm below the side glass at the weatherstrip.
    const atWaist = f.waistY - .018 + .018 * (beltLimit**2 - a*a)
      - .018 * smooth((a - beltLimit) / (1 - beltLimit));
    if (z < backFoot) {
      const start = hatch ? backFoot - .65 : Math.max(tailZ, backFoot - .65);
      return mix(rearShoulder(z, a), atWaist, smooth((z - start) / (backFoot - start)));
    }
    if (z <= frontFoot) return atWaist;
    const fender = coupe ? .044 * smooth((a - .42) / .50) - .005 * smooth((a - .93) / .07)
      : .012 * a * Math.sin(Math.PI * a)**2 - .025 * a**4;
    return profile([[frontFoot - .1, atWaist], [frontFoot, atWaist], [axle, f.axleY + fender],
      [noseZ, noseY - .012*a*a - .011*a**8]], z);
  };
  const top = (z, u) => v3(u * width(z) * .955, crown(z, u), z - setback(z, u));
  const backlightBow = hatch ? .045 : coupe ? .105 : .145;
  const beltZ = (u, t) => mix(f.cabin[0], f.cabin[3], t) + mix(-backlightBow,.145,t) * (1-u*u);
  const belt = (u, t) => top(beltZ(u,t), u*beltLimit);

  const bumperSweep = t => .096 * Math.sin(Math.PI * t) + .043 * Math.sin(2 * Math.PI * (1-t))
    - .045 * (1-t)**3;
  const side = (z, t, sign) => {
    const roof = crown(z,1);
    const y = mix(arch(z), roof, t);
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
    const blend = endBlend(z)**2;
    const x = width(z)*.955 + (swell + archFlare - rocker - scoop) * (z > 0 ? 1 - blend : 1);
    const wrap = blend * (z > 0 ? (crown(noseZ,1) - sill) * (1 - t) * rake : -bumperSweep(t));
    return v3(sign*x, y, z - setback(z,1) + wrap);
  };
  const end = (front, u, t) => {
    const z = front ? noseZ : tailZ;
    const edge = side(z,t,1);
    const upperY = crown(z,u);
    const y = mix(sill, upperY, t);
    return v3(edge.x*u, y, z - setback(z,u) + (front ? (upperY - y) * rake : -bumperSweep(t)));
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
  const raw = steps(108).map(t => mix(tailZ, noseZ, t));
  for (const axis of [-axle, axle]) {
    for (const t of steps(64)) raw.push(axis + opening * Math.cos(Math.PI * t));
  }
  const zs = [...new Set(raw.map(n => Number(n.toFixed(5))))].sort((a, b) => a - b);
  const topUs = steps(32).map(t => 2 * t - 1);
  // Cut a full opening outlined by the bases of the windshield, backlight
  // and side glazing. The cabin's inner trim uses this same belt function.
  for (const front of [false,true]) {
    const endZ = front ? noseZ : tailZ;
    patch(body, front ? 'bonnet' : 'rear_deck', m.paint, topUs, steps(56), (u,t) => {
      const cowl = beltZ(u, front ? 1 : 0);
      const z = front ? (t < .5 ? mix(cowl, axle, 2*t) : mix(axle, endZ, 2*t-1)) : mix(cowl, endZ, t);
      return top(z, u*beltLimit);
    }, v3(0,1,0));
  }
  for (const sign of [-1, 1]) {
    patch(body, 'outer_fender_shoulders', m.paint, steps(6), zs,
      (u,z) => top(z,sign*mix(beltLimit,1,u)), v3(0,1,0));
    patch(body, 'pressed_flanks', m.paint, zs, steps(20), (z, h) => side(z, h, sign), v3(sign,0,0));
    // Inner wheel tubs follow the actual arch opening and continue behind each tire.
    patch(body, 'inner_sill_and_wheel_tubs', m.rubber, zs, steps(coupe ? 8 : 3),
      (z, t) => wheelTub(z,t,sign), v3(0,-1,0));
    for (const a of [-axle, axle]) {
      const archZ = steps(64).map(t => a - opening * Math.cos(Math.PI * t));
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
  patch(body, 'rear_bumper', m.paint, topUs, steps(18), (u,v)=>end(false,u,v), v3(0,0,-1));
  const bumperSeam = u => (f.bumperUpperY - sill) / (crown(noseZ,u) - sill);
  patch(body, 'front_bumper', m.paint, topUs, steps(12),
    (u,v)=>end(true,u,v*bumperSeam(u)), v3(0,0,1));
  patch(body, 'front_upper_fascia', m.paint, topUs, steps(8),
    (u,v)=>end(true,u,mix(bumperSeam(u),1,v)), v3(0,0,1));
  patch(body, 'undertray', m.dark, [-1,1], [tailZ,noseZ], (u,z)=>v3(.47*u,f.sill,z),v3(0,-1,0));
  return { ...f, noseZ, axle, opening, side, top, end, width, belt, bumperSeam };
}
