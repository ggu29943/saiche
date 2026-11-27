import { DataTexture, Group, LinearFilter, LinearSRGBColorSpace, Material, RGBAFormat, SRGBColorSpace, Texture, TextureLoader } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EMPTY_MANIFEST, type Manifest } from './manifest';

export class AssetManager {
  private readonly gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private readonly manifests = new Map<string, Promise<Manifest | null>>();
  private readonly models = new Map<string, Promise<Group | null>>();
  private readonly textures = new Map<string, Promise<Texture | null>>();
  private readonly colorViews = new WeakMap<Texture, Texture>();
  private readonly hdrs = new Map<string, Promise<DataTexture | null>>();
  private readonly audio = new Map<string, Promise<AudioBuffer | null>>();
  private loaded = 0;
  private total = 0;
  onProgress: (loaded: number, total: number) => void = () => {};

  constructor(private readonly baseUrl: string) {}

  private request<T>(cache: Map<string, Promise<T | null>>, path: string | undefined, load: (url: string) => Promise<T>) {
    if (!path) return Promise.resolve(null);
    const existing = cache.get(path);
    if (existing) return existing;
    const pending = Promise.resolve().then(() => load(this.baseUrl + path)).catch(() => {
      console.info('[assets] missing', path);
      return null;
    }).finally(() => this.onProgress(++this.loaded, this.total));
    cache.set(path, pending);
    this.onProgress(this.loaded, ++this.total);
    return pending;
  }

  async loadManifest(): Promise<Manifest> {
    const result = await this.request(this.manifests, 'manifest.json', async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const data: Partial<Manifest> = await response.json();
      return { version: data.version ?? 1, cars: data.cars ?? {}, env: data.env ?? {},
        track: data.track ?? {}, scenery: data.scenery ?? {}, audio: data.audio ?? {} };
    });
    return result ?? EMPTY_MANIFEST;
  }

  async loadGLB(path?: string): Promise<Group | null> {
    const model = await this.request(this.models, path, async url => {
      const gltf = await this.gltf.loadAsync(url);
      // alphaTest alone cannot distinguish MASK with a zero cutoff from OPAQUE.
      for (const [object, source] of gltf.parser.associations) {
        if (object instanceof Material && source.materials !== undefined &&
          gltf.parser.json.materials[source.materials].alphaMode === 'MASK') object.userData.gltfAlphaMode = 'MASK';
      }
      return gltf.scene;
    });
    return model?.clone() ?? null;
  }

  async loadScenery(id: string) {
    const manifest = await this.loadManifest();
    const model = await this.loadGLB(manifest.scenery[id]);
    let visibleMesh = false;
    model?.traverseVisible(node => { if (node.type === 'Mesh') visibleMesh = true; });
    return visibleMesh ? model : null;
  }

  async loadTexture(path?: string, srgb = false): Promise<Texture | null> {
    const texture = await this.request(this.textures, path, url => new TextureLoader().loadAsync(url));
    if (!texture || !srgb) return texture;
    let view = this.colorViews.get(texture);
    if (!view) {
      view = texture.clone();
      view.colorSpace = SRGBColorSpace;
      this.colorViews.set(texture, view);
    }
    return view;
  }

  loadHDR(path?: string): Promise<DataTexture | null> {
    return this.request(this.hdrs, path, async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      // Parse inside the request so a malformed response follows the same fallback as a 404.
      const { data, width, height, type } = new RGBELoader().parse(await response.arrayBuffer());
      const texture = new DataTexture(data, width, height, RGBAFormat, type);
      texture.colorSpace = LinearSRGBColorSpace;
      texture.minFilter = texture.magFilter = LinearFilter;
      texture.flipY = true;
      texture.needsUpdate = true;
      return texture;
    });
  }

  loadAudio(ctx: AudioContext, path?: string): Promise<AudioBuffer | null> {
    return this.request(this.audio, path, async url => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      return ctx.decodeAudioData(await response.arrayBuffer());
    });
  }
}
