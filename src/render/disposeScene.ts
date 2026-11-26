import { BufferGeometry, InstancedMesh, Material, Mesh, Scene, ShaderMaterial, Texture } from 'three';

export function disposeScene(scene: Scene, extraMaterials: Material[] = []) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>(extraMaterials);
  const textures = new Set<Texture>();
  scene.traverse(node => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    if (node instanceof InstancedMesh) node.dispose();
  });
  for (const material of materials) {
    const slots: unknown[] = [...Object.values(material), ...Object.values(material.userData)];
    if (material instanceof ShaderMaterial) {
      for (const uniform of Object.values(material.uniforms)) slots.push(uniform.value);
    }
    for (const slot of slots) {
      if (slot instanceof Texture && !slot.isRenderTargetTexture) textures.add(slot);
    }
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  scene.clear();
}
