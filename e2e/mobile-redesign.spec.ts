import { randomUUID } from 'crypto';
import { test, expect } from '@playwright/test';

for (const width of [320, 390, 430]) {
  test(`redesigned kitchen preserves week and long content at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    expect((await page.request.post('/api/auth/register', { data: { email: `redesign-${randomUUID()}@test.local`, password: 'redesign-test-password' } })).status()).toBe(201);
    const week = '2030-01-07';
    const title = 'Slow roasted tomato pasta with a very generous handful of garden greens';
    const recipe = await (await page.request.post('/api/meals', { data: { title, description: 'A family favorite with long instructions and exact original amounts.', instructions: 'Roast the tomatoes gently.\n\nStir through the pasta and serve.', notes: 'Private household note', ingredients: [{ amount: 'a generous handful, plus extra to serve', ingredient: 'Spinach' }, { amount: '500 g', ingredient: 'Pasta' }] } })).json();
    for (const date of ['2030-01-11', '2030-01-11', null]) {
      expect((await page.request.post(`/api/plans/${week}/entries`, { data: { mealId: recipe.id, date } })).status()).toBe(201);
    }
    const before = await (await page.request.get(`/api/plans/${week}`)).json();
    await page.goto(`/week?week=${week}`);
    await expect(page.getByRole('navigation', { name: 'Family kitchen' })).toBeVisible();
    await expect(page.getByRole('button', { name: `${title} Home cooking`, exact: true })).toHaveCount(3);
    await expect(page.getByRole('region', { name: 'Tonight', exact: true })).toHaveCount(0);
    const check = async (name: string) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
      const path = testInfo.outputPath(`${name}-${width}.png`);
      await page.screenshot({ path, fullPage: !name.includes('short-viewport') });
      await testInfo.attach(`${name}-${width}`, { path, contentType: 'image/png' });
    };
    await check('plan');
    for (const [name, path] of [['Shop', '/shopping'], ['Recipes', '/recipes'], ['Plan', '/week']]) {
      await page.getByRole('navigation', { name: 'Family kitchen' }).getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(`${path}?week=${week}`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      if (name === 'Shop') await expect(page.getByRole('checkbox', { name: 'Purchased Spinach', exact: true })).toBeVisible();
      if (name === 'Recipes') await expect(page.getByRole('button', { name: title, exact: false })).toBeVisible();
      if (name === 'Plan') await expect(page.getByRole('button', { name: `${title} Home cooking`, exact: true })).toHaveCount(3);
      await check(name.toLowerCase());
    }
    const add = page.getByRole('button', { name: 'Add dinner', exact: true });
    await add.click();
    await page.getByRole('button', { name: 'Saved recipe', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Choose a saved recipe' });
    await picker.getByLabel('Search recipes', { exact: true }).fill('no matching saved dinner');
    await expect(picker.getByText('No recipes match. Try a different search.')).toBeVisible();
    await picker.getByLabel('Search recipes', { exact: true }).fill('tomato');
    await expect(picker.getByRole('button', { name: title, exact: true })).toBeVisible();
    await page.setViewportSize({ width, height: 430 });
    await picker.getByLabel('Search recipes', { exact: true }).focus();
    for (let index = 0; index < 9; index++) {
      await page.keyboard.press('Tab');
      expect(await picker.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    const bounds = await picker.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(430);
    await check('picker-short-viewport');
    await page.keyboard.press('Escape');
    await expect(add).toBeFocused();
    await page.setViewportSize({ width, height: 844 });
    if (width === 390) {
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      await check('plan-large-text');
    }
    expect(await (await page.request.get(`/api/plans/${week}`)).json()).toEqual(before);
    expect(errors).toEqual([]);
  });
}

test('long recipe editor keeps Save visible above a shortened viewport and preserves exact private fields', async ({ page }, testInfo) => {
  expect((await page.request.post('/api/auth/register', { data: { email: `editor-${randomUUID()}@test.local`, password: 'editor-test-password' } })).status()).toBe(201);
  const ingredients = Array.from({ length: 12 }, (_, index) => ({ amount: index === 11 ? 'a generous handful, plus extra to serve' : `${index + 1} tbsp`, ingredient: `Ingredient ${index + 1}` }));
  const recipe = await (await page.request.post('/api/meals', { data: { title: 'Twelve ingredient stew', instructions: 'Simmer gently.\nKeep these original instructions.', notes: 'Private household instructions', ingredients } })).json();
  expect((await page.request.patch(`/api/meals/${recipe.id}`, { data: { notes: 'Private household instructions' } })).status()).toBe(200);
  await page.goto('/recipes?week=2030-01-07');
  await page.getByRole('button', { name: /Twelve ingredient stew/ }).click();
  await page.getByRole('button', { name: 'Edit recipe', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Meal', exact: true });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 430 });
    const field = editor.getByLabel('Ingredient 12 name', { exact: true });
    await field.click();
    const save = editor.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeVisible();
    const bounds = await save.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(430);
    const fieldBounds = await field.boundingBox();
    expect(fieldBounds!.y).toBeGreaterThanOrEqual(0);
    expect(fieldBounds!.y + fieldBounds!.height).toBeLessThanOrEqual(bounds!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const path = testInfo.outputPath(`editor-${width}.png`);
    await page.screenshot({ path });
    await testInfo.attach(`editor-${width}`, { path, contentType: 'image/png' });
  }
  await editor.getByLabel('Ingredient 12 amount', { exact: true }).fill('two heaped cups, loosely packed');
  await editor.getByRole('button', { name: 'Move ingredient 12 up', exact: true }).click();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible();
  const saved = await (await page.request.get(`/api/meals/${recipe.id}`)).json();
  const expected = ingredients.map(row => ({ ...row }));
  expected[11].amount = 'two heaped cups, loosely packed';
  [expected[10], expected[11]] = [expected[11], expected[10]];
  expect(saved.ingredients).toEqual(expected);
  expect(saved.instructions).toBe('Simmer gently.\nKeep these original instructions.');
  expect(saved.notes).toBe('Private household instructions');
  await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: 'Family kitchen' }).getByRole('link', { name: 'Plan', exact: true }).click();
  await expect(page).toHaveURL('/week?week=2030-01-07');
});
