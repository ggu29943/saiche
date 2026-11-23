import type { Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EMPTY_MANIFEST, type Manifest } from './manifest';

export class AssetManager {
  private readonly gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private manifest?: Promise<Manifest>;
  private readonly models = new Map<string, Promise<Group | null>>();

  constructor(private readonly baseUrl: string) {}

  loadManifest(): Promise<Manifest> {
    this.manifest ??= fetch(this.baseUrl + 'manifest.json').then(async response => {
      if (!response.ok) throw new Error(String(response.status));
      const manifest: Partial<Manifest> = await response.json();
      return { ...EMPTY_MANIFEST, ...manifest, cars: manifest.cars ?? {} };
    }).catch(() => {
      console.info('[assets] missing', 'manifest.json');
      return EMPTY_MANIFEST;
    });
    return this.manifest;
  }

  async loadGLB(path?: string): Promise<Group | null> {
    if (!path) return null;
    let pending = this.models.get(path);
    if (!pending) {
      pending = this.gltf.loadAsync(this.baseUrl + path).then(gltf => gltf.scene).catch(() => {
        console.info('[assets] missing', path);
        return null;
      });
      this.models.set(path, pending);
    }
    // Each car animates its own node hierarchy. Immutable mesh geometry can be shared.
    return (await pending)?.clone() ?? null;
  }
}
