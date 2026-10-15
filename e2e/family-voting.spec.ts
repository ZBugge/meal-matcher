import { randomUUID } from 'crypto';
import { test, expect } from '@playwright/test';

test('an authenticated quick-session choice can become a planned meal', async ({ page }) => {
  expect((await page.request.post('/api/auth/register', { data: { email: `quick-family-${randomUUID()}@test.local`, password: 'family-test-password' } })).status()).toBe(201);
  const quick = await (await page.request.post('/api/quick-session', { data: { creatorName: 'Family', mode: 'takeout', meals: [{ title: 'Thai night' }] } })).json();
  expect((await page.request.post(`/api/swipes/${quick.session.id}`, { data: { participantId: quick.participantId, swipes: quick.meals.map((meal: { id: string }) => ({ mealId: meal.id, vote: 1 })) } })).status()).toBe(200);
  await page.goto(`/session/${quick.session.id}`);
  await page.getByRole('button', { name: 'Close Session', exact: true }).click();
  await page.getByRole('button', { name: 'Add Thai night to this week', exact: true }).click();
  await page.getByRole('link', { name: 'Added · View week' }).click();
  await expect(page.getByRole('heading', { name: 'Thai night', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Thai night', exact: true })).toBeVisible();
});

test('a family can search the library, collapse it, and plan several voted meals', async ({ page, browser }) => {
  const register = await page.request.post('/api/auth/register', { data: { email: `family-${randomUUID()}@test.local`, password: 'family-test-password' } });
  expect(register.status()).toBe(201);
  for (const [title, ingredient] of [['Salmon bowls', 'salmon'], ['Asian tofu', 'tofu']]) {
    const response = await page.request.post('/api/meals', { data: { title, instructions: `Cook the ${ingredient} and serve with rice.`, ingredients: [{ amount: '2 portions', ingredient }] } });
    expect(response.status()).toBe(201);
  }
  await page.goto('/dashboard');
  await expect(page.getByRole('navigation', { name: 'Family kitchen' })).toBeVisible();
  const create = page.getByRole('button', { name: 'Create Session', exact: true });
  expect((await create.boundingBox())!.y).toBeLessThan((await page.getByRole('heading', { name: 'My Meals', exact: true }).boundingBox())!.y);
  const collapse = page.getByRole('button', { name: 'Hide library', exact: true });
  await collapse.focus();
  await collapse.press('Enter');
  await expect(page.getByRole('button', { name: 'Show library' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Salmon bowls', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show library' }).press('Space');
  await expect(page.getByRole('button', { name: 'Salmon bowls', exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('Salmon');
  await expect(page.getByRole('button', { name: 'Asian tofu', exact: true })).toHaveCount(0);
  await page.getByRole('searchbox').clear();
  await create.click();
  await page.getByRole('button', { name: 'Create (2 options)', exact: true }).click();
  await expect(page).toHaveURL(/\/session\//);
  const invite = await page.locator('input[readonly]').first().inputValue();
  const partner = await browser.newPage({ baseURL: test.info().project.use.baseURL });
  try {
    await partner.goto(invite);
    await partner.locator('#name').fill('Partner');
    await partner.getByRole('button', { name: 'Start Swiping' }).click();
    for (let index = 0; index < 2; index++) {
      const title = await partner.locator('h2').innerText();
      await partner.getByTestId('swipe-yes').click();
      if (index === 0) await expect(partner.locator('h2')).not.toHaveText(title);
    }
    await expect(partner).toHaveURL(/\/results\//);
    await page.reload();
    await page.getByRole('button', { name: 'Close Session', exact: true }).click();
    await page.getByRole('button', { name: 'Add Salmon bowls to this week', exact: true }).click();
    await page.getByRole('button', { name: 'Add Asian tofu to this week', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Added · View week' })).toHaveCount(2);
    await partner.reload();
    await expect(partner.getByRole('button', { name: /Add .* to this week/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Added · View week' }).first().click();
    await expect(page.getByRole('heading', { name: 'Week plan', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Salmon bowls', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Asian tofu', exact: true })).toBeVisible();
    const library = await (await page.request.get('/api/meals')).json();
    expect(library.every((meal: { pickCount: number }) => meal.pickCount === 0)).toBe(true);
  } finally { await partner.close(); }
});
