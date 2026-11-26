import { expect, test } from '@playwright/test';

test('shows live performance statistics when stats is enabled', async ({ page }) => {
  const drive = '/?view=drive&track=valley&car=hatch';
  const canvas = page.locator('#game canvas');
  const panel = page.locator('.panel.stats-panel');

  await page.goto(drive);
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(panel).toHaveCount(0);

  await page.goto(drive + '&stats=1');
  await expect(panel).toBeVisible();
  await expect(panel.locator('dt')).toHaveText(['FPS', '画质', 'draw calls', '三角面', '物理步数']);
  await expect.poll(() => panel.locator('dd').evaluateAll(values => {
    const [fps, quality, calls, triangles, steps] = values.map(value => value.textContent);
    const state = window.__apex.state();
    return Number(fps) > 0 && fps === state.fps.toFixed(1) && quality === state.quality
      && Number(calls) > 0 && Number(triangles) > 0 && Number(steps) > 0;
  })).toBe(true);
});

test('hatch accelerates beyond 60 km/h in five seconds on valley', async ({ page }) => {
  await page.goto('/?view=drive&track=valley&car=hatch');
  await page.waitForFunction(() => {
    const state = window.__apex?.state();
    return state?.carId === 'hatch' && state.trackId === 'valley' && state.rpm > 0 && state.fps > 0;
  });

  await expect(page.locator('#game canvas')).toHaveAttribute('data-ready', 'true');
  const result = await page.evaluate(async () => {
    const game = window.__apex;
    const start = game.state();
    game.setInputOverride({ steer: 0, throttle: 1, brake: 0, handbrake: 0 });
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 5000));
      return { start, finish: game.state() };
    } finally {
      game.setInputOverride(null);
    }
  });
  expect(result.finish.speedKmh, JSON.stringify(result.finish)).toBeGreaterThan(60);
  expect(result.finish.pos).not.toEqual(result.start.pos);
});

for (const id of ['hatch', 'coupe', 'rally']) {
  test(`loads the shipped ${id} GLB and switches paint while driving`, async ({ page }) => {
    const [model] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/assets/cars/${id}/${id}.glb`)),
      page.goto(`/?view=drive&track=valley&car=${id}&paint=1`),
    ]);
    expect(model.ok()).toBe(true);
    await page.waitForFunction(() => window.__apex?.state().carModel === 'glb');
    expect(await page.evaluate(() => window.__apex.state())).toMatchObject({ carId: id, paint: 1 });
    const paint = await page.evaluate(() => {
      window.__apex.setPaint(2);
      return window.__apex.state().paint;
    });
    expect(paint).toBe(2);
  });
}

test('uses the drivable placeholder when the GLB is missing', async ({ page }) => {
  await page.route('**/assets/cars/hatch/hatch.glb', route => route.fulfill({ status: 404 }));
  await page.goto('/?view=drive&track=valley&car=hatch');
  await page.waitForFunction(() => window.__apex?.state().carModel === 'placeholder');
  await page.keyboard.down('w');
  await page.waitForFunction(() => window.__apex.state().speedKmh > 3);
  await page.keyboard.up('w');
});
