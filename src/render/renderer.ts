import * as THREE from 'three';
import type { Quality } from './materials';

export class RaceRenderer {
  readonly renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
  private inFlight: WebGLSync | null = null;
  private submittedAt = 0;
  private nextSoftwareFrame = 0;
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2200);
  readonly quality: Quality;
  private readonly softwareLow: boolean;

  constructor(root: HTMLElement, requested?: Quality, detectSoftware = false) {
    const gl = this.renderer.getContext();
    const extension = detectSoftware && gl.getExtension('WEBGL_debug_renderer_info');
    const software = extension && /swiftshader|llvmpipe|software rasterizer/i.test(
      String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)));
    this.quality = requested ?? (software || matchMedia('(pointer: coarse)').matches ? 'low' : 'medium');
    // 规格未指定：在低画质纯软件渲染器上限制像素预算，避免绘图阻塞物理步进。
    this.softwareLow = Boolean(software && this.quality === 'low');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    root.append(this.renderer.domElement);
    this.resize();
    window.addEventListener('resize', this.resize);
  }
  private resize = () => {
    const { innerWidth: width, innerHeight: height } = window;
    const maxRatio = this.softwareLow
      ? Math.min(1, Math.sqrt(480 * 270 / (width * height)))
      : { low: 1, medium: 1.5, high: 2 }[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxRatio));
    this.renderer.setSize(width, height);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };
  draw(scene: THREE.Scene) {
    // Skip duplicate GPU submissions while the last picture is still being drawn.
    // The animation loop can continue processing input and physics on slower GPUs.
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (this.inFlight) {
      if (gl.clientWaitSync(this.inFlight, 0, 0) === gl.TIMEOUT_EXPIRED) return;
      gl.deleteSync(this.inFlight);
      this.inFlight = null;
      if (this.softwareLow) {
        // Software rasterization competes with input and physics for CPU time.
        // Leave a comparable interval free after each expensive frame.
        const elapsed = performance.now() - this.submittedAt;
        this.nextSoftwareFrame = this.submittedAt + Math.min(250, 2 * elapsed);
      }
    }
    if (this.softwareLow) {
      const now = performance.now();
      if (now < this.nextSoftwareFrame) return;
      this.submittedAt = now;
    }
    this.renderer.render(scene, this.camera);
    this.inFlight = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    this.renderer.domElement.dataset.ready = 'true';
  }
  dispose() {
    window.removeEventListener('resize', this.resize);
    if (this.inFlight) (this.renderer.getContext() as WebGL2RenderingContext).deleteSync(this.inFlight);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
