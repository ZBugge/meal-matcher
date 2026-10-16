import { randomUUID } from 'crypto';
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('recipe metadata and usual groceries coexist without changing saved week snapshots or household privacy', async ({ page, browser }, testInfo) => {
  const registration = await page.request.post('/api/auth/register', {
    data: { email: `${randomUUID()}@pilot.test`, password: 'parallel-family-password' },
  });
  expect(registration.status()).toBe(201);
  const recipeResponse = await page.request.post('/api/meals', { data: {
    title: 'Pilot family tofu', totalMinutes: 20, effort: 'easy',
    instructions: 'Bake until golden.', ingredients: [{ amount: '1½ tbsp', ingredient: 'olive oil' }],
  } });
  expect(recipeResponse.status()).toBe(201);
  const recipe = await recipeResponse.json();
  const entry = await page.request.post('/api/plans/2026-10-19/entries', { data: { mealId: recipe.id } });
  expect(entry.status()).toBe(201);
  const templateResponse = await page.request.post('/api/plans/2026-10-19/recurring', {
    data: { ingredient: 'Coffee', amount: 'one large bag' },
  });
  expect(templateResponse.status()).toBe(201);
  const template = await templateResponse.json();
  const apply = () => page.request.post('/api/plans/2026-10-19/recurring/apply', { data: { ids: [template.id] } });
  expect((await apply()).status()).toBe(200);
  expect((await apply()).status()).toBe(200);
  const before = await (await page.request.get('/api/plans/2026-10-19')).json();
  expect(before.shopping.filter((item: { ingredient: string }) => item.ingredient === 'Coffee')).toHaveLength(1);
  expect((await page.request.patch(`/api/meals/${recipe.id}`, { data: {
    totalMinutes: 45, effort: 'involved', ingredients: [{ amount: '2 tbsp', ingredient: 'olive oil' }],
  } })).status()).toBe(200);
  expect((await page.request.patch(`/api/plans/2026-10-19/recurring/${template.id}`, {
    data: { ingredient: 'Coffee', amount: 'two small bags' },
  })).status()).toBe(200);
  const after = await (await page.request.get('/api/plans/2026-10-19')).json();
  expect(after.shopping).toEqual(before.shopping);
  const storedRecipe = await (await page.request.get(`/api/meals/${recipe.id}`)).json();
  expect(storedRecipe).toMatchObject({ totalMinutes: 45, effort: 'involved' });
  await page.goto('/shopping?week=2026-10-19');
  await expect(page.getByRole('heading', { name: 'Shopping list', exact: true })).toBeVisible();
  await expect(page.getByText('Coffee', { exact: true })).toBeVisible();
  await expect(page.getByText('one large bag', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await testInfo.attach('parallel-family-shopping-phone', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  const other = await browser.newContext();
  try {
    const foreign = await other.request.post('/api/auth/register', {
      data: { email: `${randomUUID()}@pilot.test`, password: 'parallel-family-password' },
    });
    expect(foreign.status()).toBe(201);
    expect((await other.request.get(`/api/meals/${recipe.id}`)).status()).toBe(404);
    expect((await other.request.post('/api/plans/2026-10-19/recurring/apply', { data: { ids: [template.id] } })).status()).toBe(404);
    expect(await (await other.request.get('/api/plans/2026-10-19/recurring')).json()).toEqual([]);
    expect((await (await other.request.get('/api/plans/2026-10-19')).json()).shopping).toEqual([]);
  } finally { await other.close(); }
});
