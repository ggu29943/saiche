import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

export function kerbTexture(anisotropy: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#C8102E';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#F2F2F2';
  ctx.fillRect(0, 128, 64, 128);
  ctx.fillStyle = '#2A2A2A';
  ctx.fillRect(58, 0, 6, 256);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}
