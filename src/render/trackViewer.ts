import { placeScenery } from '@/track/scenery';
import { buildWater } from './water';
import { buildProps } from '@/track/props';
import { buildBarriers } from '@/track/barriers';
import { buildTerrain } from '@/track/terrain';
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
    const terrain = buildTerrain(track, 'medium', mats);
    this.scene.add(terrain.mesh, buildTrackMeshes(track, mats));
    this.scene.add(buildBarriers(track, mats), buildProps(track, terrain.heightAt));
    this.scene.add(placeScenery(track, terrain.heightAt, 'medium', null));
    const water = buildWater(env);
    if (water) this.scene.add(water);
    this.controls.update();
  }
  draw() { this.display.draw(this.scene); }
}
