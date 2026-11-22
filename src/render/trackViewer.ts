import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Track } from '@/track/track';
import { buildTrackScene } from './trackScene';
import { RaceRenderer } from './renderer';

export class TrackViewer {
  readonly scene: THREE.Scene;
  readonly display: RaceRenderer;
  readonly controls: OrbitControls;
  constructor(root: HTMLElement, readonly track: Track) {
    this.display = new RaceRenderer(root, 'medium');
    const { camera, renderer } = this.display;
    this.controls = new OrbitControls(camera, renderer.domElement);
    const bounds = new THREE.Box3();
    for (const pos of track.pos) bounds.expandByPoint(new THREE.Vector3(...pos));
    bounds.getCenter(this.controls.target);
    camera.position.copy(this.controls.target).add(new THREE.Vector3(0,900,0.01));
    this.scene = buildTrackScene(track).scene;
    this.controls.update();
  }
  draw() { this.display.draw(this.scene); }
}
