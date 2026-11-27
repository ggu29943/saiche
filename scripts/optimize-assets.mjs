import { spawnSync } from 'node:child_process';

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length) {
  console.error('Usage: npm run assets:optimize -- <input.glb> <output.glb>');
  process.exitCode = 1;
} else {
  const result = spawnSync('npx', ['gltf-transform', 'optimize', input, output, '--compress', 'meshopt',
    '--flatten', 'false', '--join', 'false', '--palette', 'false', '--instance', 'false', '--simplify', 'false',
    '--texture-compress', 'webp', '--texture-size', '2048'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
