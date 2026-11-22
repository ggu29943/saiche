import { buildTrackMeshes } from '@/track/trackMesh';
import { createMaterials } from './materials';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Track } from '@/track/track';
import { RaceRenderer } from './renderer';

export class TrackViewer {
  readonly scene = new THREE.Scene();
  readonly display: RaceRenderer;
  readonly controls: OrbitControls;
  constructor(root: HTMLElement, readonly track: Track) {
    this.display = new RaceRenderer(root);
    const { camera, renderer } = this.display;
    this.controls = new OrbitControls(camera, renderer.domElement);
    const bounds = new THREE.Box3();
    for (const pos of track.pos) bounds.expandByPoint(new THREE.Vector3(...pos));
    bounds.getCenter(this.controls.target);
    camera.position.copy(this.controls.target).add(new THREE.Vector3(0,900,0.01));
    const env = track.data.environment;
    this.scene.background = new THREE.Color('#111820');
    this.scene.fog = new THREE.Fog(env.fogColor, env.fogNear, env.fogFar);
    this.scene.add(new THREE.HemisphereLight('#DDE8F5','#4A5A3A',1.2));
    const sun = new THREE.DirectionalLight('#FFFFFF',2);
    sun.position.set(...env.sunDirection);
    this.scene.add(sun);
    const mats = createMaterials(null, 'medium');
    this.scene.add(buildTrackMeshes(track, mats));
    for (const side of [-1,1]) {
      const points = track.pos.map((pos,i) => new THREE.Vector3(...pos)
        .addScaledVector(new THREE.Vector3(...track.left[i]), side*track.barrierOffset(i)));
      this.scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: '#FF3030' })));
    }
    this.controls.update();
  }
  draw() { this.display.draw(this.scene); }
}
