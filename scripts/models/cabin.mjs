import * as T from 'three';
import { v3, mix, profile, smooth, steps, patch, bead, oval, mesh } from './geometry.mjs';

export function buildCabin(body, car, f, m) {
  const [, backRoof, frontRoof] = f.cabin;
  // Keep full headroom over the second row. Aft of it, the roof rolls down
  // and narrows into the almost upright hatch glass and the roof spoiler.
  const tailRoll = t => car.id === 'hatch' ? 1 - smooth(t / .30) : 0;
  const roofHalfWidth = t => f.roofWidth * (.955 + .045*Math.sin(Math.PI*t)) - .028*tailRoll(t);
  const roofRailHeight = t => f.height - f.roofCrown - .042*(2*t-1)**2 - .105*tailRoll(t);
  // A wider belt and a narrower roof create tumblehome. Windscreen corners
  // recede relative to its centre and all four panes curve in two directions.
  const rail = (t,h,sign) => {
    const foot = f.belt(sign,t);
    const topZ = mix(backRoof,frontRoof,t);
    const roofX = sign * roofHalfWidth(t);
    const roofY = roofRailHeight(t);
    return v3(mix(foot.x,roofX,h) + sign*.012*Math.sin(Math.PI*h),
      mix(foot.y,roofY,h), mix(foot.z,topZ,h));
  };
  const panePoint = (front,u,h) => {
    const end = front ? 1 : 0;
    const foot = f.belt(u,end);
    const corner = rail(end,1,1);
    const crown = 1-u*u;
    return v3(mix(foot.x,corner.x*u,h) + u*.012*Math.sin(Math.PI*h),
      mix(foot.y,corner.y + f.roofCrown*crown,h) + .012*Math.sin(Math.PI*h)*crown,
      mix(foot.z,corner.z + (front ? .07 : -.07)*crown,h));
  };
  const range = (a,b,n)=>steps(n).map(t=>mix(a,b,t));
  const tile = (name, material, at, outward, left, right, low, high, nx = 12, ny = 6) =>
    patch(body, name, material, range(left,right,nx), range(low,high,ny), at, outward);
  for (const sign of [-1,1]) {
    const at = (u,v)=>rail(u,v,sign), normal = v3(sign,0,0);
    const sidePane = (name, material, u0,u1,h0,h1) => tile(name,material,at,normal,u0,u1,h0,h1);
    sidePane('side_window_sill',m.dark,0,1,0,.065);
    sidePane('upper_roof_rail',m.paint,0,1,.9,1);
    sidePane('roof_seal',m.rubber,0,1,.86,.9);
    const pillarEnd = car.id === 'hatch' ? .105 : .078;
    sidePane('C_pillar',m.paint,0,pillarEnd,.065,.86);
    sidePane('C_pillar_gasket',m.rubber,pillarEnd,pillarEnd+.013,.065,.86);
    sidePane('rear_quarter_glass',m.glass,pillarEnd+.013,f.doorSplit-.017,.065,.86);
    sidePane('B_pillar',m.dark,f.doorSplit-.017,f.doorSplit+.026,.065,.86);
    sidePane('door_glass',m.glass,f.doorSplit+.026,.933,.065,.86);
    sidePane('A_pillar_gasket',m.rubber,.933,.949,.065,.86);
    sidePane('A_pillar',m.paint,.949,1,.065,.86);
    bead(body,'window_belt_trim',m.dark, steps(25).map(t=>rail(t,.03,sign)), .008);

    const doorLine = (fraction, sweep) => {
      const z0 = rail(fraction,.02,sign).z, pts = [rail(fraction,0,sign)];
      for (const t of steps(16)) {
        const z = z0 + sweep*t;
        const p = f.side(z, mix(.99,.09,t), sign);
        p.x += sign*.002;
        pts.push(p);
      }
      bead(body, 'door_shut_line', m.dark, pts, .004, 5);
    };
    doorLine(.978,.17);
    doorLine(car.id === 'coupe' ? f.doorSplit : .12,.13);
    if (car.id !== 'coupe') doorLine(f.doorSplit,-.075);
    const handle = t => {
      const z = rail(t,0,sign).z, mount = f.side(z,.83,sign);
      mount.x += sign*.009;
      oval(body,'door_handle_recess',m.rubber,mount,[.010,.023,.088]);
      mount.x += sign*.011; mount.y += .005;
      oval(body,'flush_door_handle',m.paint,mount,[.013,.013,.073]);
    };
    handle(f.doorSplit+.075);
    if (car.id !== 'coupe') handle(.225);

    const root = rail(.916,.12,sign), elbow = root.clone().add(v3(sign*.080,.025,-.006));
    bead(body,'mirror_stalk',m.dark,[root,elbow,elbow.clone().add(v3(sign*.026,.022,0))],.024,8);
    const housing = elbow.clone().add(v3(sign*.042,.040,0));
    oval(body,'mirror_cap',m.paint,housing,[.114,.055,.093]);
    oval(body,'mirror_backplate',m.rubber,housing.clone().add(v3(0,-.009,-.035)),[.103,.048,.066]);
    oval(body,'mirror_glass',m.alloy,housing.clone().add(v3(0,-.006,-.078)),[.085,.034,.019]);
  }

  for (const front of [false,true]) {
    const at = (u,v)=>panePoint(front,u,v);
    const normal = v3(0,.6,front?1:-1);
    tile('painted_screen_pillar',m.paint,at,normal,-1,-.936,0,1);
    tile('painted_screen_pillar',m.paint,at,normal,.936,1,0,1);
    tile('screen_gasket',m.rubber,at,normal,-.936,-.915,0,1);
    tile('screen_gasket',m.rubber,at,normal,.915,.936,0,1);
    tile('screen_gasket',m.rubber,at,normal,-.915,.915,0,.060);
    tile('screen_gasket',m.rubber,at,normal,-.915,.915,.948,1);
    tile(front ? 'windscreen' : 'rear_windscreen',m.glass,at,normal,-.915,.915,.060,.948,24,14);
    if (front) {
      for (const shift of [-.40,.36]) {
        const points = steps(12).map(t => {
          const p = at(shift-.33+.55*t,.067+.052*t);
          p.z += .005; p.y += .003; return p;
        });
        bead(body,'windscreen_wiper',m.dark,points,.009);
      }
    } else if (car.id === 'hatch') {
      const onGlass = (u, h) => at(u,h).add(v3(0,.002,-.014));
      const pivot = onGlass(.13,.04);
      oval(body,'tailgate_wiper_pivot',m.rubber,pivot,[.025,.025,.015],12);
      bead(body,'tailgate_wiper_arm',m.dark,[pivot,onGlass(.03,.12),onGlass(-.21,.16)],.009);
      bead(body,'tailgate_wiper_blade',m.rubber,
        steps(10).map(t => onGlass(mix(-.52,.095,t),.15+.012*Math.sin(Math.PI*t))),.011,8);
    }
  }
  const roof = (u,t) => {
    const aft = panePoint(false,u,1), fore = panePoint(true,u,1);
    const p = aft.clone().lerp(fore,t);
    p.y = roofRailHeight(t) + f.roofCrown * (1-u*u);
    p.x = roofHalfWidth(t)*u;
    return p;
  };
  patch(body,'crowned_roof_panel',m.paint,range(-1,1,26),steps(26),roof,v3(0,1,0));

  patch(body, 'headliner', m.textile, range(-1,1,18), steps(16), (u,t) => {
    const p = roof(.995*u, t);
    p.y -= .018;
    return p;
  }, v3(0,-1,0));
  for (const sign of [-1,1]) {
    const interiorPillar = (name, u0, u1) =>
      tile(name, m.rubber, (u,h) => {
        const p = rail(u,h,sign);
        p.x -= sign*.012;
        return p;
      }, v3(-sign,0,0), u0,u1,0,1,4,8);
    interiorPillar('A_pillar_inner', .943,1);
    interiorPillar('B_pillar_inner', f.doorSplit-.017,f.doorSplit+.026);
    interiorPillar('C_pillar_inner', 0,car.id === 'hatch' ? .105 : .078);
  }
  buildInterior(body, car, f, m);
  return { rail, roof, panePoint };
}

// A horizontal slice loft gives each seat a lumbar section, a shoulder and a
// neck; both the visible front and back contain real upholstery geometry.
function seatLoft(body, name, material, cx, sections) {
  const widths = sections.map(([y,w]) => [y,w]);
  const depths = sections.map(([y,,d]) => [y,d]);
  const offsets = sections.map(([y,,,z]) => [y,z]);
  const at = (angle, h) => {
    const depth = profile(depths,h);
    const width = profile(widths,h);
    const z = profile(offsets,h);
    const rounded = n => Math.sign(n) * Math.abs(n)**.68;
    return v3(cx + width*rounded(Math.cos(angle)),h,z + depth*rounded(Math.sin(angle)));
  };
  const angles = steps(20).map(t => 2*Math.PI*t);
  const height = steps(18).map(t => mix(sections[0][0], sections.at(-1)[0], t));
  patch(body,name,material,angles,height,at,v3(-1,0,0));
  return at;
}

function buildInterior(body, car, f, m) {
  const floor = f.sill + .115;
  const atFloor = (u,t) => {
    const p = f.belt(u,t);
    return v3(p.x*.86, floor, p.z*.87);
  };
  const across = steps(16).map(t => 2*t-1);
  patch(body,'footwells',m.textile,across,steps(18),atFloor,v3(0,1,0));
  for (const sign of [-1,1]) {
    const innerDoor = (t,h) => {
      const p = atFloor(sign,t).lerp(f.belt(sign,t),h);
      p.x -= sign*.033*Math.sin(Math.PI*h);
      return p;
    };
    patch(body,'door_cards',m.dark,steps(30),steps(8),innerDoor,v3(-sign,0,0));
    const inset = (t,h,amount) => {
      const p = innerDoor(t,h);
      p.x -= sign*amount;
      return p;
    };
    bead(body, 'inner_belt_seal',m.rubber,steps(24).map(t => inset(t,.985,.006)),.012);
    bead(body, 'door_armrest', m.textile, steps(12).map(t => inset(.31+.43*t,.53+.065*t,.03)),.043);
    bead(body, 'door_pull',m.alloy,steps(6).map(t => inset(.66+.062*t,.75+.025*t,.014)),.009);
  }
  for (const t of [0,1]) {
    patch(body,t ? 'firewall' : 'rear_bulkhead',m.rubber,across,steps(5),
      (u,h) => atFloor(u,t).lerp(f.belt(u,t),h),v3(0,0,t ? -1 : 1));
  }

  const dash = (u,t) => {
    const base = f.belt(u,1);
    const dz = profile([[0,0],[.25,.095],[.55,.272],[.69,.34],[.8,.35],[1,.305]],t);
    const dy = profile([[0,-.008],[.25,.003],[.55,.014],[.69,-.008],[.8,-.078],[1,-.225]],t);
    base.z -= dz*(1-.20*u*u);
    base.x *= 1-.037*t;
    base.y += dy;
    return base;
  };
  patch(body,'padded_dashboard',m.dark,across,steps(18),dash,v3(0,1,-.4));
  bead(body,'dashboard_parting_line',m.rubber,
    across.map(u => dash(u*.97,.805).add(v3(0,0,-.004))),.005);
  const instrumentBase = dash(.48,.66);
  oval(body,'instrument_binnacle',m.rubber,instrumentBase.clone().add(v3(0,.008,.014)),
    [.174,.064,.125],24);
  const dialPanel = instrumentBase.clone().add(v3(0,.002,-.083));
  oval(body,'dial_face',m.lens,dialPanel,[.14,.043,.031],20);
  for (const shift of [-.068,.058]) {
    const ring = mesh(body,'gauge_ring',m.alloy,new T.TorusGeometry(.03,.0025,6,18));
    ring.position.copy(dialPanel).add(v3(shift,.003,-.026));
  }
  for (const u of [-.75,-.13,.14,.76]) {
    const vent = dash(u,.78);
    oval(body,'dash_vents',m.rubber,vent,[.064,.015,.016],12);
  }

  const [backFoot,,,frontFoot] = f.cabin;
  const rearDeck = (u,h) => {
    const base = f.belt(u,0);
    base.z += .24*h*(1-.34*u*u);
    base.y -= .035*h;
    base.x *= 1-.04*h;
    return base;
  };
  patch(body,'parcel_shelf',m.textile,across,steps(8),rearDeck,v3(0,1,0));
  const frontZ = car.id === 'coupe' ? -.46 : -.25;
  const seatHeight = f.height - (car.id === 'coupe' ? .15 : .17);
  for (const x of [-.365,.365]) {
    const cushionY = floor+.17;
    oval(body,'front_cushion',m.textile,v3(x,cushionY,frontZ+.16),[.225,.091,.26]);
    // The seat inclines towards the rear as it rises; shoulders taper into
    // a narrower head rest. This also keeps the head rests below the roof.
    const seatSections = [
      [cushionY-.055,.135,.064,frontZ+.035],
      [cushionY+.075,.185,.076,frontZ+.026],
      [mix(cushionY,seatHeight,.47),.196,.080,frontZ-.056],
      [mix(cushionY,seatHeight,.71),.213,.068,frontZ-.105],
      [mix(cushionY,seatHeight,.79),.171,.050,frontZ-.127],
      [mix(cushionY,seatHeight,.82),.057,.037,frontZ-.132],
      [mix(cushionY,seatHeight,.865),.101,.048,frontZ-.133],
      [mix(cushionY,seatHeight,.95),.105,.048,frontZ-.147],
      [seatHeight,.008,.008,frontZ-.150]
    ];
    const seat = seatLoft(body,'sport_seat',m.textile,x,seatSections);
    for (const angle of [.20,Math.PI-.20]) {
      const piping = steps(20).map(t => seat(angle,mix(cushionY+.04,seatHeight-.14,t)));
      bead(body,'seat_welt',m.piping,piping,.005,6);
    }
    for (const side of [-1,1]) {
      const bolster = oval(body,'seat_side_bolster',m.textile,
        v3(x+side*.16,mix(cushionY,seatHeight,.40),frontZ+.005),[.052,.23,.079],16);
      bolster.rotation.x=-.21;
    }
  }
  const rearZ = mix(backFoot,frontZ,.36);
  oval(body,'rear_seat_base',m.textile,v3(0,floor+.22,rearZ+.11),[.58,.10,.22],20);
  const bench = oval(body,'rear_seat_back',m.textile,v3(0,floor+.43,rearZ-.02),[.60,.23,.105]);
  bench.rotation.x = -.25;
  for (const side of [-1,1]) {
    oval(body,'rear_headrest',m.textile,v3(side*.32,floor+.64,rearZ-.065),[.115,.085,.068],16);
  }
  oval(body,'centre_console',m.dark,v3(0,floor+.19,frontZ+.39),[.105,.16,.42],20);
  const lever = v3(0,floor+.33,frontZ+.54);
  bead(body,'shift_lever',m.rubber,[lever,lever.clone().add(v3(0,.095,-.016))],.015,8);
  oval(body,'shift_knob',m.alloy,lever.clone().add(v3(0,.105,-.018)),[.028,.037,.027],12);

  const hub = v3(.365, instrumentBase.y-.033,frontFoot-.50);
  const wheel = mesh(body,'steering_wheel',m.rubber,new T.TorusGeometry(.155,.017,8,36));
  wheel.position.copy(hub);
  wheel.rotation.x=.39;
  const col = dash(.48,.97);
  bead(body,'steering_column',m.rubber,[col,hub],.044,10);
  oval(body,'steering_horn_pad',m.dark,hub,[.076,.057,.031],16);
  for(const angle of [-Math.PI/2,.12,Math.PI-.12]) {
    const rim = v3(.153*Math.cos(angle),.153*Math.sin(angle),0);
    rim.applyAxisAngle(v3(1,0,0),wheel.rotation.x).add(hub);
    bead(body,'steering_spoke',m.dark,[hub,rim],.019,8);
  }
}
