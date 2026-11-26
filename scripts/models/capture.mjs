import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(root, 'docs/screenshots');
const models = process.argv.slice(2);
if (!models.length) models.push('hatch', 'coupe', 'rally');
if (models.some(id => !['hatch', 'coupe', 'rally'].includes(id))) {
  throw new Error('Usage: node scripts/models/capture.mjs [hatch|coupe|rally ...]');
}
await mkdir(output, { recursive: true });
const server = await createServer({
  root, logLevel: 'error', server: { host: '127.0.0.1', port: 0, hmr: false },
  optimizeDeps: { entries: ['scripts/models/studio.html'] },
});
let browser;
try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1120, height: 700 }, deviceScaleFactor: 1 });
  for (const id of models) {
    await page.goto(new URL('scripts/models/studio.html', url).href);
    await page.waitForFunction(() => typeof window.createStudio === 'function');
    await page.evaluate(async id => {
      window.drawModel = await window.createStudio(id);
    }, id);
    for (const view of ['front', 'rear', 'side', 'top']) {
      await page.evaluate(view => window.drawModel(view), view);
      const file = 'car-' + id + '-' + view + '.png';
      await page.locator('canvas').screenshot({ path: join(output, file) });
      console.log(file);
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
