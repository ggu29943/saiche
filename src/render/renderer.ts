import * as THREE from 'three';
import { QUALITY, type Quality } from './quality';
import { createPostFX } from './postfx';

export class RaceRenderer {
  readonly renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2200);
  private composer?: ReturnType<typeof createPostFX>;
  private scene?: THREE.Scene;
  private inFlight: WebGLSync | null = null;
  private submittedAt = 0;
  private nextSoftwareFrame = 0;
  readonly software: boolean;
  private firstSoftwareFrame: boolean;

  constructor(root: HTMLElement, public quality: Quality, automatic: boolean) {
    const gl = this.renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    this.software = Boolean(extension && /swiftshader|llvmpipe|software rasterizer/i.test(
      String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL))));
    this.firstSoftwareFrame = this.software && automatic;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.info.autoReset = false;
    root.append(this.renderer.domElement);
    this.setQuality(quality);
    window.addEventListener('resize', this.resize);
  }

  setQuality(quality: Quality) {
    this.quality = quality;
    this.renderer.shadowMap.enabled = QUALITY[quality].shadows;
    this.renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.composer?.dispose();
    this.composer = undefined;
    this.resize();
    if (this.scene) this.composer = createPostFX(this.renderer, this.scene, this.camera, quality);
  }

  private resize = () => {
    const { innerWidth: width, innerHeight: height } = window;
    const ratio = Math.min(window.devicePixelRatio, QUALITY[this.quality].maxPixelRatio);
    // 规格未指定：软件驱动冷启动时先显示一帧较小的完整场景，下一帧恢复所选档位的分辨率。
    const startupRatio = this.firstSoftwareFrame ? Math.sqrt(640 * 360 / (width * height)) : ratio;
    this.renderer.setPixelRatio(Math.min(ratio, startupRatio));
    this.renderer.setSize(width, height);
    this.composer?.setSize(width, height);
    this.camera.far = QUALITY[this.quality].viewDistance;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  setScene(scene?: THREE.Scene) {
    this.composer?.dispose();
    this.scene = scene;
    this.composer = scene && createPostFX(this.renderer, scene, this.camera, this.quality);
    if (this.inFlight) (this.renderer.getContext() as WebGL2RenderingContext).deleteSync(this.inFlight);
    this.inFlight = null;
    this.nextSoftwareFrame = 0;
    delete this.renderer.domElement.dataset.ready;
    this.renderer.renderLists.dispose();
  }

  prepareScene(scene: THREE.Scene) {
    this.setScene(scene);
    const previous = this.renderer.getRenderTarget();
    // Compile the same linear HDR shaders used by RenderPass on the first frame.
    this.renderer.setRenderTarget(this.composer!.inputBuffer);
    try {
      return this.renderer.compileAsync(scene, this.camera);
    } finally {
      this.renderer.setRenderTarget(previous);
    }
  }

  draw(dt: number) {
    if (!this.composer) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const canvas = this.renderer.domElement;
    if (this.inFlight) {
      const status = gl.clientWaitSync(this.inFlight, 0, 0);
      if (status === gl.TIMEOUT_EXPIRED) return;
      gl.deleteSync(this.inFlight);
      this.inFlight = null;
      if (status !== gl.WAIT_FAILED) canvas.dataset.ready = 'true';
      if (this.software) {
        // 规格未指定：纯软件光栅化与物理争用 CPU，给输入和物理留出上一帧的绘制时间。
        const now = performance.now();
        this.nextSoftwareFrame = now + Math.min(500, now - this.submittedAt);
      }
    }
    this.submittedAt = performance.now();
    if (this.software && this.submittedAt < this.nextSoftwareFrame) return;
    if (this.firstSoftwareFrame && canvas.dataset.ready) {
      this.firstSoftwareFrame = false;
      this.resize();
    }
    this.renderer.info.reset();
    this.composer.render(dt);
    this.inFlight = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    if (!this.inFlight && !gl.isContextLost()) canvas.dataset.ready = 'true';
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.setScene();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
