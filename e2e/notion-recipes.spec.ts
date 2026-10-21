import { randomUUID } from 'crypto';
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('Notion setup validates through the server and preserves regular recipes on failure', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  expect((await page.request.post('/api/auth/register', { data: { email: `${randomUUID()}@notion.test`, password: 'notion-test-password' } })).status()).toBe(201);
  expect((await page.request.post('/api/meals', { data: { title: 'Keep regular soup', instructions: 'Simmer gently.', ingredients: [{ amount: 'a handful', ingredient: 'Beans' }] } })).status()).toBe(201);
  await page.goto('/recipes');
  await expect(page.getByRole('button', { name: /Keep regular soup/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Notion recipes' }).click();
  await expect(page.getByLabel('Notion connection token')).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: /Keep regular soup/ })).not.toBeVisible();
  await page.getByLabel('Recipe database link').fill('invalid-database-id');
  await page.getByLabel('Notion connection token').fill('synthetic-notion-setup-token');
  const response = page.waitForResponse(response => response.url().endsWith('/api/notion') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Connect and refresh' }).click();
  expect((await response).status()).toBe(400);
  await expect(page.getByRole('alert')).toContainText('valid Notion database');
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('synthetic-notion-setup-token');
  expect((await page.request.get('/api/notion')).status()).toBe(200);
  expect(await (await page.request.get('/api/notion')).json()).toMatchObject({ connected: false, recipeCount: 0 });
  const size = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(size.content).toBeLessThanOrEqual(size.width);
  await testInfo.attach('notion-setup-phone', { body: await page.screenshot({ path: testInfo.outputPath('notion-setup-phone.png'), fullPage: true }), contentType: 'image/png' });
  await page.getByRole('tab', { name: 'Regular recipes' }).click();
  await expect(page.getByRole('button', { name: /Keep regular soup/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /Keep regular soup/ })).toBeVisible();
  expect(errors).toEqual([]);
});
