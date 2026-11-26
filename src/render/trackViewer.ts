import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Track } from '@/track/track';
import type { TrackScene } from './trackScene';
import { RaceRenderer } from './renderer';

export class TrackViewer {
  readonly controls: OrbitControls;
  constructor(readonly display: RaceRenderer, readonly track: Track, private readonly level: TrackScene) {
    const { camera, renderer } = this.display;
    this.controls = new OrbitControls(camera, renderer.domElement);
    const bounds = new THREE.Box3();
    for (const pos of track.pos) bounds.expandByPoint(new THREE.Vector3(...pos));
    bounds.getCenter(this.controls.target);
    camera.position.copy(this.controls.target).add(new THREE.Vector3(0,900,0.01));
    this.controls.update();
  }
  dispose() {
    this.controls.dispose();
    this.level.dispose();
  }
  draw(dt: number) {
    this.level.environment.update(this.controls.target, this.display.camera.position);
    this.display.draw(dt);
  }
}
