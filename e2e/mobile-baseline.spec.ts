import { randomUUID } from 'crypto';
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('phone home, library, and recipe remain usable after reload', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  async function checkLayoutAndCapture(name: string) {
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(layout.content, `${name} should fit the phone viewport`).toBeLessThanOrEqual(layout.viewport);
    await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }

  const health = await page.request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ status: 'ok' });
  const home = await page.goto('/');
  expect(home?.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Create Session', exact: true })).toBeVisible();
  await checkLayoutAndCapture('phone-home');

  const registration = await page.request.post('/api/auth/register', {
    data: { email: `${randomUUID().slice(0, 8)}@qa.test`, password: 'mobile-test-password' },
  });
  expect(registration.status()).toBe(201);
  const instructions = 'Brush salmon with olive oil. Bake until cooked through. Serve with rice and vegetables.';
  const recipe = await page.request.post('/api/meals', {
    data: {
      title: 'Weeknight Salmon',
      description: 'A simple dinner with rice and vegetables.',
      instructions,
      ingredients: [
        { amount: '2 fillets', ingredient: 'salmon' },
        { amount: '1 tbsp', ingredient: 'olive oil' },
      ],
    },
  });
  expect(recipe.status()).toBe(201);

  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Show library', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Weeknight Salmon', exact: true })).toBeVisible();
  await checkLayoutAndCapture('phone-library');
  await page.getByRole('button', { name: 'Weeknight Salmon', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Weeknight Salmon' });
  await expect(dialog.getByText('2 fillets')).toBeVisible();
  await expect(dialog.getByText('salmon', { exact: true })).toBeVisible();
  await expect(dialog.getByText('1 tbsp')).toBeVisible();
  await expect(dialog.getByText('olive oil', { exact: true })).toBeVisible();
  await expect(dialog.getByText(instructions, { exact: true })).toBeVisible();
  await checkLayoutAndCapture('phone-recipe');

  await page.reload();
  await page.getByRole('button', { name: 'Show library', exact: true }).click();
  await page.getByRole('button', { name: 'Weeknight Salmon', exact: true }).click();
  await expect(dialog.getByText('2 fillets')).toBeVisible();
  await expect(dialog.getByText(instructions, { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
