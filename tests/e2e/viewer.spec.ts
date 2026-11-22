import { expect, test } from '@playwright/test';

test('renders the valley circuit without browser errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/?view=track&track=valley');
  const canvas = page.locator('#game canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await page.screenshot({ path: 'test-results/viewer-valley.png' });
  expect(errors).toEqual([]);
});
