import { LatheGeometry, Vector2 } from 'three';
import { bead, mesh, mix, patch, steps, v3 } from './geometry.mjs';

// Fascia hardpoints live on the stamped bumper: u is signed half-width, v is
// height from sill to deck. Each concentric layer stands clear of the last.
const lamps = {
  hatch: {
    head: [[.37,.77],[.44,.88],[.78,.98],[.97,.94],[.96,.73],[.76,.61],[.49,.65]],
    brow: [[.43,.78],[.56,.86],[.76,.93],[.90,.91]],
    projector: [.76,.77,.081,.10],
    tail: [[.60,.70],[.64,.89],[.92,.99],[.985,.94],[.98,.47],[.86,.45],[.80,.60]],
    running: [[.67,.77],[.76,.83],[.89,.87],[.92,.80],[.91,.54]],
    brake: [[.69,.69],[.78,.73],[.87,.77]],
  },
  coupe: {
    head: [[.30,.77],[.63,.92],[.92,.985],[.99,.93],[.90,.74],[.58,.68],[.40,.69]],
    brow: [[.35,.78],[.57,.85],[.78,.92],[.94,.94]],
    projector: [.77,.833,.046,.057],
  },
  rally: {
    head: [[.38,.64],[.40,.87],[.72,.97],[.94,.93],[.975,.83],[.92,.61],[.61,.59]],
    brow: [[.43,.86],[.67,.92],[.88,.89]],
    projector: [.75,.765,.086,.115],
    tail: [[.42,.68],[.48,.90],[.77,.99],[.96,.95],[.98,.70],[.87,.61],[.57,.60]],
    running: [[.50,.82],[.69,.875],[.89,.85]],
    brake: [[.51,.71],[.68,.765],[.89,.75]],
  },
};

const apertures = {
  hatch: [[-.68,.17],[-.49,.51],[-.37,.55],[.37,.55],[.49,.51],[.68,.17],[.62,.13],[-.62,.13]],
  coupe: [[-.68,.14],[-.51,.39],[-.32,.48],[.32,.48],[.51,.39],[.68,.14],[.58,.09],[-.58,.09]],
  rally: [[-.63,.17],[-.55,.51],[-.44,.54],[.45,.54],[.55,.51],[.63,.17],[.54,.13],[-.54,.13]],
};

// Quadratic corner rounds preserve the flat optically active parts of a lens.
// Subdividing towards the centre makes the patch follow the curved fascia.
function roundedOutline(points, round = .16) {
  const boundary = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i + points.length - 1) % points.length];
    const here = points[i], next = points[(i + 1) % points.length];
    const pre = here.map((x, k) => mix(x, prev[k], round));
    const post = here.map((x, k) => mix(x, next[k], round));
    for (const t of [0, .5, 1]) {
      boundary.push(here.map((x, k) => mix(mix(pre[k], x, t), mix(x, post[k], t), t)));
    }
    const nextPre = next.map((x, k) => mix(x, here[k], round));
    boundary.push(post.map((x,k) => mix(x,nextPre[k],.5)));
  }
  boundary.push(boundary[0]);
  return boundary;
}

const middle = points => [0, 1].map(k => points.reduce((sum, p) => sum + p[k], 0) / points.length);

function panel(body, name, material, points, point, normal) {
  const center = middle(points);
  const boundary = roundedOutline(points);
  return patch(body, name, material, boundary.map((_, i) => i), steps(4), (i,t) => {
    const p = boundary[i];
    return point(mix(center[0], p[0], t), mix(center[1], p[1], t));
  }, normal);
}

// A rim is a hollow, rolled section. Its outer flange meets the bumper, its
// peak catches a highlight and its inner face descends to the dark back wall.
function rim(body, name, mat, outline, project, normal, profile) {
  const center = middle(outline);
  const boundary = roundedOutline(outline);
  patch(body, name, mat, boundary.map((_, index) => index), profile.map((_, index) => index),
    (index, section) => {
      const [width, height, depth] = profile[section];
      const [u, v] = boundary[index];
      return project(mix(center[0], u, width), mix(center[1], v, height)).addScaledVector(normal, depth);
    }, normal);
}

function ellipse(body, name, mat, center, rx, ry, project, normal) {
  const points = steps(20).slice(0,-1).map(t => [
    center[0] + rx * Math.cos(t * 2 * Math.PI), center[1] + ry * Math.sin(t * 2 * Math.PI),
  ]);
  // A spun optical projector is domed, to distinguish it from the DRL strip.
  patch(body, name, mat, steps(20).map((_, i) => i), steps(4), (i, t) => {
    const p = points[i % points.length];
    return project(mix(center[0], p[0], t), mix(center[1], p[1], t)).addScaledVector(normal, .008 * (1-t*t));
  }, normal);
}

function pipe(body, name, mat, points, project, radius) {
  bead(body, name, mat, points.map(([u,v]) => project(u,v)), radius);
}

function grilleInsert(body, shape, m, outline, id, front) {
  const normal = v3(0,0,front ? 1 : -1);
  const on = depth => (u,v) => shape.end(front,u,v).addScaledVector(normal,depth);
  const project = on(0);
  panel(body, 'radiator_back', m.rubber, outline, on(.006), normal);
  rim(body, 'intake_return', m.dark, outline, project, normal, [
    [1.02, 1.02, .003], [1, 1, .017], [.962, .88, .038], [.93, .79, .037], [.89, .70, .008],
  ]);
  if (front && id !== 'coupe') {
    const honeycomb = id === 'hatch';
    const radiusU = honeycomb ? .037 : .049;
    const radiusV = honeycomb ? .038 : .053;
    const rowStep = radiusV * (honeycomb ? 1.5 : 1);
    const colStep = radiusU * (honeycomb ? Math.sqrt(3) : 2);
    const sides = honeycomb ? 6 : 4;
    for (let row = 0; row < 4; row++) {
      const v = .245 + row * rowStep;
      const span = mix(.505, .405, row / 3);
      for (let col = -9; col <= 9; col++) {
        const u = colStep * (col + (row % 2) / 2);
        if (Math.abs(u) + radiusU > span) continue;
        // Taper the walls into each opening. All cell walls share the same
        // graphite material and are packed into a single exported primitive.
        patch(body, 'grille_cell', m.lens, steps(sides), [0, 1, 2], (t, section) => {
          const a = t * Math.PI * 2 + Math.PI / 2;
          const radius = [1, .86, .78][section];
          return on([.018, .021, .010][section])(u + radius * radiusU * Math.cos(a),
            v + radius * radiusV * Math.sin(a));
        }, normal);
      }
    }
    return;
  }
  const count = front ? (id === 'rally' ? 4 : 3) : 2;
  for (let j = 0; j < count; j++) {
    const row = (j+1)/(count+1);
    const y = front ? mix(id==='coupe'?.12:.17,id==='coupe'?.42:.48,row) : mix(.12,.27,row);
    const span = front ? mix(.53,.40,row) : .52;
    patch(body, 'intake_louvre', m.lens, steps(20), [0, 1, 2, 3], (t, edge) => {
      const u = (2*t - 1) * span;
      const rise = y + .008 * Math.sin(Math.PI * t);
      return on([.013, .030, .034, .013][edge])(u, rise + [-.016, -.008, .003, .025][edge]);
    }, normal);
  }
}

function addLamp(body, car, shape, m, sign, front) {
  const p = lamps[car.id];
  const normal = v3(0,0,front?1:-1);
  const on = depth => (u,v) => {
    if (front && car.id !== 'coupe') {
      // Keep the whole lamp assembly between the horizontal bumper seam
      // and the bonnet edge, including its gasket at the outer corner.
      const upper = shape.end(true, sign*u, 1).y;
      const y = mix(shape.bumperUpperY + .014, upper - .011, (v - .54) / .48);
      v = (y - shape.sill) / (upper - shape.sill);
    }
    return shape.end(front,sign*u,v).addScaledVector(normal,depth);
  };
  const outline = front ? p.head : p.tail;
  panel(body, front?'headlamp_gasket':'rear_lamp_gasket', m.rubber, outline, on(.010), normal);
  const mid = [0,1].map(k=>outline.reduce((n,q)=>n+q[k],0)/outline.length);
  const inset = outline.map(([u,v])=>[mix(mid[0],u,.97),mix(mid[1],v,.91)]);
  panel(body, front?'headlamp_housing':'rear_lens', front?m.lens:m.redLens, inset, on(.015), normal);
  if (front) {
    rim(body, 'headlamp_chamfer', m.dark, outline, on(0), normal, [
      [1.025, 1.07, .002], [1, 1, .023], [.975, .91, .027], [.945, .83, .014],
    ]);
    const [u,v,rx,ry] = p.projector;
    const project = (x, y, r) => {
      // Parabolic reflector sections curl forward around a luminous lens.
      const section = [[1.05,.016], [1.02,.036], [.91,.041], [.83,.039], [.59,.015]];
      patch(body, 'projector_reflector', m.chrome, steps(32), section.map((_, i) => i), (t,i) => {
        const [radius, depth] = section[i], a = t * Math.PI * 2;
        return on(depth)(x + rx*r*radius*Math.cos(a), y + ry*r*radius*Math.sin(a));
      }, normal);
      ellipse(body, 'projector_socket', m.lens, [x,y],rx*r*.64,ry*r*.64,on(.021),normal);
      ellipse(body, 'projector_lens', m.light_head, [x,y],rx*r*.48,ry*r*.48,on(.032),normal);
    };
    project(u,v,1);
    if (car.id==='rally') project(.54,.746,.80);
    if (car.id==='coupe') project(.62,.794,.84);
    panel(body, 'protective_optic_cover', m.opticCover, inset, (u,v) => {
      const dome = 1 - Math.min(1, ((u-mid[0])/.34)**2 + ((v-mid[1])/.20)**2);
      return on(.028 + .025*dome)(u,v);
    }, normal);
    pipe(body, 'front_running_light', m.light_head,p.brow,on(.029),car.id==='coupe'?.007:.009);
  } else {
    rim(body, 'tail_lamp_moulding', m.redLens, outline, on(0), normal, [
      [1.025, 1.06, .002], [1, 1, .019], [.97, .91, .035], [.90, .76, .018],
    ]);
    pipe(body, 'rear_running_light', m.light_tail, p.running, on(.028), .013);
    pipe(body, 'stop_light', m.light_brake, p.brake, on(.027), .015);
  }
}

// A continuous running light crosses the deck and turns onto each rear
// quarter. The two larger stop segments retain their own brake material.
function coupeTail(body, shape, m) {
  const rear = v3(0, 0, -1);
  function carrier(u, h) {
    if (Math.abs(u) <= 1) return shape.end(false, u, h);
    const z = shape.tailZ + (Math.abs(u) - 1);
    return shape.side(z, h, Math.sign(u));
  }
  function strip(name, material, start, end, height, depth) {
    const stations = steps(Math.ceil((end - start) * 30)).map(t => mix(start, end, t));
    for (const corner of [-1, 1]) if (corner > start && corner < end) stations.push(corner);
    stations.sort((a, b) => a - b);
    patch(body, name, material, [...new Set(stations)], steps(4), (u,t) => {
      const h = height(u, t);
      const tangent = carrier(u + .001, h).sub(carrier(u - .001, h));
      const outward = v3(tangent.z, 0, -tangent.x).normalize();
      return carrier(u, h).addScaledVector(outward, depth + .002 * Math.sin(Math.PI * t));
    }, rear);
  }
  const sweep = u => .715 + .105 * Math.min(1, Math.abs(u)) ** 2;
  const lensSpan = u => .063 + .050 * Math.min(1, Math.abs(u)) ** 2;
  strip('tail_light_seal', m.rubber, -1.12, 1.12,
    (u,t) => sweep(u) + (2*t-1) * lensSpan(u), .008);
  strip('tail_light_lens', m.redLens, -1.111, 1.111,
    (u,t) => sweep(u) + (2*t-1) * (lensSpan(u)-.011), .015);
  strip('continuous_rear_light', m.light_tail, -1.10, 1.10,
    (u,t) => sweep(u) + .019 + .028*t, .022);
  for (const [start,end] of [[-1.09,-.48],[.48,1.09]]) {
    strip('outer_stop_light', m.light_brake, start, end,
      (u,t) => sweep(u) - .052 + .044*t, .022);
  }
}

function sideInlet(body,car,shape,m,sgn) {
  const normal = v3(0,0,1);
  const on = depth => (u,v) => shape.end(true,sgn*u,v).addScaledVector(normal,depth);
  const intake = car.id==='coupe'
    ? [[.71,.15],[.65,.29],[.72,.54],[.94,.60],[.91,.22]]
    : [[.70,.17],[.68,.30],[.76,.47],[.94,.48],[.91,.18]];
  panel(body, 'corner_duct_back', m.rubber, intake, on(.007), normal);
  rim(body, 'corner_duct_bezel', m.dark, intake, on(0), normal, [
    [1.04, 1.05, .002], [1, 1, .019], [.90, .86, .029], [.79, .72, .008],
  ]);
  for (const v of [.258,.323]) pipe(body,'intake_blade',m.lens,
    [[.72,v],[.795,v+.013],[.89,v+.032]],on(.016),.006);
}

function frontSplitter(body, shape, m) {
  const stations = steps(48).map(t => mix(-.99, .99, t));
  const centerZ = shape.end(true, 0, .053).z;
  const section = (u, edge) => {
    const p = shape.end(true, u, .053 + .052 * u**4);
    const leadingZ = shape.frontTipZ + (p.z - centerZ) - .018*u**4;
    // The upper and lower returns meet the bumper behind the rounded nose.
    p.z = edge === 0 || edge === 3 ? p.z - .006 : leadingZ - (edge === 2 ? .003 : 0);
    p.y += [.008, .006, -.005, -.012][edge] * (1 - .35*u**4);
    return p;
  };
  for (const [a,b,normal] of [[0,1,v3(0,1,0)],[1,2,v3(0,0,1)],[2,3,v3(0,-1,0)]]) {
    patch(body, 'front_splitter', m.dark, stations, [a,b], section, normal);
  }
  for (const u of [stations[0],stations.at(-1)]) {
    patch(body,'splitter_end',m.dark,[0,1],[0,1],(t,h) =>
      section(u,h ? 3 : 0).lerp(section(u,h ? 2 : 1),t),v3(Math.sign(u),0,0));
  }
}

function exhaust(body, shape, m, u, rx, ry) {
  const center = shape.end(false,u,.18);
  // Rolled, open steel tube with a dark inner sleeve. The tube axis is -Z.
  const ring = (name, mat, profile) => {
    const geo = new LatheGeometry(profile.map(([d,r])=>new Vector2(r,d)),32);
    geo.rotateX(-Math.PI / 2).scale(rx,ry,1).translate(center.x,center.y,center.z);
    return mesh(body,name,mat,geo);
  };
  ring('exhaust_tip',m.chrome,[[-.017,.94],[.034,1],[.040,.96],[.040,.80],[.034,.77],[.028,.78]]);
  ring('exhaust_bore',m.rubber,[[.029,.785],[-.016,.785],[-.016,.001]]);
}

export function addFascias(body, car, shape, m) {
  grilleInsert(body,shape,m,apertures[car.id],car.id,true);
  grilleInsert(body,shape,m,[[-.90,.11],[-.69,.33],[-.38,.35],[.38,.35],[.69,.33],
    [.90,.11],[.85,.06],[-.85,.06]],car.id,false);
  for (const sgn of [-1,1]) {
    addLamp(body,car,shape,m,sgn,true);
    if (car.id !== 'coupe') addLamp(body,car,shape,m,sgn,false);
    sideInlet(body,car,shape,m,sgn);
  }
  if (car.id === 'coupe') coupeTail(body,shape,m);
  const endPoint = (front,d) => (u,v) => shape.end(front,u,v).add(v3(0,0,front?d:-d));
  if (car.id !== 'coupe') {
    panel(body,'upper_grille',m.rubber,[[-.37,.72],[-.34,.85],[.34,.85],[.37,.72],[.23,.665],[-.23,.665]],
      endPoint(true,.009),v3(0,0,1));
    pipe(body,'grille_crossbar',m.dark,[[-.317,.766],[-.15,.765],[.15,.765],[.317,.766]],endPoint(true,.016),.008);
  }
  // The seam is an exterior reference for the bumper top and headlamp base.
  const seam = steps(48).map(t => {
    const u = mix(-.99,.99,t);
    return endPoint(true,.002)(u,shape.bumperSeam(u));
  });
  bead(body,'bumper_shut_line',m.dark,seam,.0025,6);
  frontSplitter(body,shape,m);
  pipe(body,'rear_valance',m.dark,steps(16).map(t=>{
    const u = mix(-.95,.95,t); return [u,.053 + .052 * Math.abs(u)**4];
  }),endPoint(false,.012),.018);
  if (car.id==='coupe') {
    for (const s of [-1,1]) exhaust(body,shape,m,s*.72,.083,.037);
  } else if (car.id==='hatch') {
    for (const u of [.60,.75]) exhaust(body,shape,m,u,.043,.036);
  } else exhaust(body,shape,m,.70,.065,.060);
}
