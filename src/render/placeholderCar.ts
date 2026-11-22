import * as THREE from 'three';
import type { CarConfig } from '@/physics/types';

export function buildPlaceholderCar(cfg: CarConfig): THREE.Group {
  const model = new THREE.Group();
  model.name = cfg.id;

  const paint = new THREE.MeshStandardMaterial({ name: 'paint', color: cfg.visual.paints[0] });
  const glass = new THREE.MeshStandardMaterial({ name: 'glass', color: '#0A0C10', roughness: 0.05 });
  const brake = new THREE.MeshStandardMaterial({ name: 'light_brake', color: '#550000' });
  const head = new THREE.MeshStandardMaterial({ name: 'light_head', color: '#DDDDDD' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.80,0.62,4.20),paint);
  body.name = 'body';
  body.position.y = 0.62;
  model.add(body);
  function bodyPart(name: string, geometry: THREE.BoxGeometry, material: THREE.Material, x: number,y: number,z: number) {
    const part = new THREE.Mesh(geometry,material);
    part.name = name;
    part.position.set(x,y-body.position.y,z);
    body.add(part);
  }
  bodyPart('cabin',new THREE.BoxGeometry(1.50,0.50,2.00),glass,0,1.17,-0.25);
  const brakeGeometry = new THREE.BoxGeometry(0.30,0.10,0.04);
  const headGeometry = new THREE.BoxGeometry(0.35,0.12,0.04);
  for (const side of [1,-1]) {
    const label = side===1 ? 'L' : 'R';
    bodyPart('brake_'+label,brakeGeometry,brake,0.65*side,0.80,-2.11);
    bodyPart('head_'+label,headGeometry,head,0.60*side,0.72,2.11);
  }

  const { radius, width } = cfg.wheel;
  const tyreGeometry = new THREE.CylinderGeometry(radius,radius,width,24).rotateZ(Math.PI/2);
  const hubGeometry = new THREE.CylinderGeometry(radius*0.62,radius*0.62,width+0.01,12).rotateZ(Math.PI/2);
  const tyreMaterial = new THREE.MeshStandardMaterial({color:'#151515',roughness:0.9});
  const hubMaterial = new THREE.MeshStandardMaterial({color:'#9A9DA3',metalness:0.8});
  const zMid = (cfg.wheels[0].mount[2]+cfg.wheels[2].mount[2])/2;
  for (const { id,mount } of cfg.wheels) {
    const wheel = new THREE.Mesh(tyreGeometry,tyreMaterial);
    wheel.name = 'wheel_'+id;
    wheel.position.set(mount[0],radius,mount[2]-zMid);
    wheel.add(new THREE.Mesh(hubGeometry,hubMaterial));
    model.add(wheel);
  }
  model.traverse(node => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return model;
}
