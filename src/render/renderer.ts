import * as THREE from 'three';

export class RaceRenderer {
  readonly renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2200);
  constructor(root: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    root.append(this.renderer.domElement);
    this.resize();
    window.addEventListener('resize', this.resize);
  }
  private resize = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };
  draw(scene: THREE.Scene) {
    this.renderer.render(scene, this.camera);
    this.renderer.domElement.dataset.ready = 'true';
  }
  dispose() {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
