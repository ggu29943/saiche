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
