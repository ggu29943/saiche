import { v3, steps, mix, patch, bead, oval } from './geometry.mjs';

function rearWing(body, m, center, span, chord, thickness, painted) {
  const sections = steps(36).map(t=>2*t-1);
  const chordwise = steps(20);
  const point = (u,t,upper) => {
    const taper = 1 - .25 * Math.abs(u)**5;
    const foil = thickness * Math.sin(Math.PI*t)**.68 * taper;
    return v3(span*u, center.y - .026*u*u + .030*(1-t) + (upper ? foil : -foil*.48),
      center.z + .048*u*u + chord*taper*(t-.5));
  };
  const material = painted ? m.paint : m.dark;
  for(const upper of [false,true]) {
    patch(body,'rear_airfoil',material,sections,chordwise,(u,t)=>point(u,t,upper),v3(0,upper?1:-1,0));
  }
  for(const sign of [-1,1]) {
    patch(body,'wing_tip',material,chordwise,[0,1],(t,h)=>point(sign,t,false).lerp(point(sign,t,true),h),v3(sign,0,0));
  }
}

export function addAero(body, car, f, c, m) {
  for(const sign of [-1,1]) {
    const bonnet = steps(30).map(t=>{
      const z = mix(f.cabin[3]+.095,f.noseZ-.067,t);
      const p=f.top(z,sign*mix(.74,.65,t));
      p.y+=.002; return p;
    });
    bead(body,'bonnet_shut_line',m.dark,bonnet,.0035,5);
    if(car.id==='coupe') {
      // The narrow vent behind the front wheel follows the rising flank crease.
      for(let j=0;j<3;j++) {
        const points=steps(14).map(t=>{
          const p=f.side(mix(.65,.92,t)-.03*j,.67+.064*j-.080*t,sign);
          p.x+=sign*.003; return p;
        });
        bead(body,'fender_vent',m.dark,points,.008);
      }
    }
  }
  if(car.id==='hatch') {
    const anchor=c.roof(0,0);
    const wing=v3(0,anchor.y+.018,anchor.z-.080);
    for(const s of [-1,1]){
      const from=c.roof(s*.83,.04);
      bead(body,'roof_spoiler_strut',m.dark,[from,v3(s*.54,wing.y-.014,wing.z+.009)],.028,10);
    }
    rearWing(body,m,wing,.72,.25,.034,true);
    const middle=v3(0,wing.y+.007,wing.z-.119);
    bead(body,'high_mount_stop_light',m.light_brake,[middle.clone().add(v3(-.18,0,0)),middle.clone().add(v3(.18,0,0))],.012,8);
  } else if(car.id==='rally') {
    // The scoop starts flush just ahead of the axle. Its roof descends more
    // slowly than the bonnet, making room for the forward-facing opening.
    const zBack = f.axle + .025, zMouth = f.noseZ - .22;
    const onBonnet = (z,x) => f.top(z,x/(f.width(z)*.955));
    const base = (u,t) => onBonnet(mix(zBack,zMouth,t),u*mix(.285,.265,t));
    const scoop = (u,t) => {
      const p = base(u,t);
      p.y += (onBonnet(zBack,p.x).y - p.y) * .64 * (1 - .53*u**4);
      return p;
    };
    patch(body,'hood_scoop',m.paint,steps(22).map(t=>2*t-1),steps(21),scoop,v3(0,1,0));
    for(const sign of [-1,1]) {
      patch(body,'scoop_cheek',m.paint,steps(20),steps(5),(t,h)=>{
        const p=scoop(sign,t);
        p.y=mix(base(sign,t).y,p.y,h); p.x+=sign*.004*t*Math.sin(Math.PI*h); return p;
      },v3(sign,0,0));
    }
    const mouth=(u,h)=>{
      const p=scoop(u,1);
      p.y=mix(base(u,1).y,p.y,h);
      p.z-=.045*Math.sin(Math.PI*h)*(1-u**4);
      return p;
    };
    patch(body,'scoop_opening',m.rubber,steps(24).map(t=>2*t-1),steps(9),mouth,v3(0,0,1));
    const across=steps(30).map(t=>2*t-1);
    patch(body,'scoop_lip',m.paint,across,[0,1],(u,t)=>{
      const p=scoop(u,1);
      p.z+=.007*t; p.y-=.009*t;
      return p;
    },v3(0,.3,1));
    for(const u of [-.55,0,.55]) {
      bead(body,'intake_internal_fin',m.dark,steps(9).map(h=>mouth(u,.12+.72*h)),.005);
    }
    const wing=v3(0,1.22,-1.91);
    for(const sign of [-1,1]){
      const z=-1.88, x=sign*.53, foot=f.top(z,x/(f.width(z)*.955));
      // Profiled uprights grow out of the deck, swept back below the wing.
      const post=(u,t)=>{
        const h=t*(wing.y-foot.y), halfChord=mix(.126,.070,t);
        return v3(x+.023*Math.cos(u),foot.y+h,z-.037*t+halfChord*Math.sin(u));
      };
      patch(body,'spoiler_pedestal',m.paint,steps(20).map(t=>2*Math.PI*t),steps(12),post,v3(-1,0,0));
    }
    rearWing(body,m,wing,.835,.235,.032,true);
    for(const axis of [-f.axle,f.axle]) for(const sign of [-1,1]) {
      const z=axis-car.wheel.radius-.066;
      const flap=(u,t,reverse=0)=>v3(sign*(.645+.232*u),mix(.106,.48,t),
        z-.047*(1-t)**2-.017*u*u-.012*Math.sin(Math.PI*t)+reverse);
      const out=v3(0,0,-1);
      patch(body,'mudflap',m.rubber,steps(8),steps(10),(u,t)=>flap(u,t),out);
      patch(body,'mudflap_reverse',m.rubber,steps(6),steps(8),(u,t)=>flap(u,t,.006),v3(0,0,1));
      bead(body,'mudflap_reinforcement',m.dark,steps(10).map(u=>flap(u,.77,-.004)),.008);
    }
  } else {
    // The coupe's integral ducktail stays below the fastback roofline.
    const z=f.tailZ+.085;
    patch(body,'rear_deck_kick',m.paint,steps(26).map(t=>2*t-1),steps(12),(u,t)=>{
      const zz=z+.14*t, x=u*f.width(zz)*.8;
      const p=f.top(zz,x/(f.width(zz)*.955));
      p.y+=.046*Math.sin(Math.PI*t)**.7*(1-u**4);
      return p;
    },v3(0,1,0));
  }
}
