import { expect, test } from '@playwright/test';

test('hatch accelerates beyond 60 km/h in five seconds on valley', async ({ page }) => {
  await page.goto('/?view=drive&track=valley&car=hatch');
  await page.waitForFunction(() => {
    const state = window.__apex?.state();
    return state?.carId === 'hatch' && state.trackId === 'valley' && state.rpm > 0;
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
