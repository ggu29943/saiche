import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Group } from 'three';
import { makeMaterials } from './geometry.mjs';
import { buildShell } from './shell.mjs';
import { buildCabin } from './cabin.mjs';
import { addAero } from './aero.mjs';
import { addFascias } from './fascias.mjs';
import { buildWheel, buildCaliper } from './wheels.mjs';
import { writeCar } from './export.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const ids=process.argv.slice(2);
const models=['hatch','coupe','rally'];
for(const id of ids.length ? ids : models){
  if(!models.includes(id)) throw new Error('Unknown car: '+id);
  const car=JSON.parse(await fs.readFile(path.join(root,'src/data/cars',id+'.json'),'utf8'));
  const body=new Group(), materials=makeMaterials(car);
  const shell=buildShell(body,car,materials);
  const cabin=buildCabin(body,car,shell,materials);
  addFascias(body,car,shell,materials);
  addAero(body,car,shell,cabin,materials);
  const pair=build=>new Map([-1,1].map(sign=>[sign,build(car,sign)]));
  const dir=path.join(root,'public/assets/cars',id);
  await fs.mkdir(dir,{recursive:true});
  const glb=path.join(dir,id+'.glb');
  const staging=await fs.mkdtemp(path.join(dir,'.generate-'));
  try {
    const raw=path.join(staging,'source.glb'), packed=path.join(staging,id+'.glb');
    await writeCar(raw,body,pair(buildWheel),pair(buildCaliper),car);
    execFileSync(process.execPath,[path.join(root,'scripts/optimize-assets.mjs'),raw,packed],{stdio:'inherit'});
    await fs.rename(packed,glb);
  } finally {
    await fs.rm(staging,{recursive:true,force:true});
  }
  console.log(path.relative(root,glb)+' ('+(await fs.stat(glb)).size+' bytes)');
}
