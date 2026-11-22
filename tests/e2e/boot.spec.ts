import { test, expect } from '@playwright/test';
test('starts on title screen', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__apex));
  expect(await page.evaluate(() => window.__apex.state().screen)).toBe('title');
});
