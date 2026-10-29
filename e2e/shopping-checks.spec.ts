import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, timezoneId: 'America/New_York' });

test('shopping mistaps stay crossed off in their aisle and can be restored after reload', async ({ page }, testInfo) => {
  const week = '2026-10-12';
  expect((await page.request.post('/api/auth/register', { data: { email: `shopping-check-${Date.now()}-${Math.random()}@example.test`, password: 'synthetic-password123' } })).status()).toBe(201);
  const recipe = await page.request.post('/api/meals', { data: { title: 'Bean soup', ingredients: [{ amount: '2 cans', ingredient: 'Beans' }, { amount: '1 bag', ingredient: 'Rice' }] } });
  expect(recipe.status()).toBe(201);
  expect((await page.request.post(`/api/plans/${week}/entries`, { data: { mealId: (await recipe.json()).id } })).status()).toBe(201);
  // A second contribution must be checked and restored together with the first.
  expect((await page.request.post(`/api/plans/${week}/items`, { data: { ingredient: 'Beans', amount: '1 can' } })).status()).toBe(201);
  await page.goto(`/shopping?week=${week}`);
  const beans = page.getByRole('checkbox', { name: 'Purchased Beans', exact: true });
  const pantry = page.getByRole('region', { name: 'Pantry', exact: true });
  const title = pantry.getByText('Beans', { exact: true });
  await expect(beans).toBeVisible();
  await expect(pantry.getByText('3 cans', { exact: true })).toBeVisible();
  await title.tap(); // Reproduce tapping the ingredient itself on a phone.
  await expect(beans).toBeEnabled(); await expect(beans).toBeChecked(); await expect(beans).toBeVisible();
  await expect(title).toHaveCSS('text-decoration-line', 'line-through');
  await expect(pantry.getByRole('checkbox', { name: 'Purchased Rice', exact: true })).not.toBeChecked();
  await expect(page.getByText('1 line left to buy', { exact: true })).toBeVisible();
  await testInfo.attach('shopping-checked-phone', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.reload();
  await expect(beans).toBeVisible(); await expect(beans).toBeChecked();
  await title.tap();
  await expect(beans).toBeEnabled(); await expect(beans).not.toBeChecked();
  await expect(title).toHaveCSS('text-decoration-line', 'none');
  const restored = await (await page.request.get(`/api/plans/${week}`)).json();
  expect(restored.shopping).toHaveLength(3);
  expect(restored.shopping.every((item: { state: string }) => item.state === 'needed')).toBe(true);
  // Failed checks and failed restorations both preserve the accepted visible state.
  await page.route(`**/api/plans/${week}/items/bulk`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Could not save. Try again.' }) }));
  await title.tap();
  await expect(page.getByRole('alert')).toHaveText('Could not save. Try again.');
  await expect(beans).not.toBeChecked(); await expect(title).toHaveCSS('text-decoration-line', 'none');
  await page.unroute(`**/api/plans/${week}/items/bulk`);
  await title.tap(); await expect(beans).toBeEnabled(); await expect(beans).toBeChecked();
  await page.route(`**/api/plans/${week}/items/bulk`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Could not restore. Try again.' }) }));
  await title.tap();
  await expect(page.getByRole('alert')).toHaveText('Could not restore. Try again.');
  await expect(beans).toBeVisible(); await expect(beans).toBeChecked(); await expect(title).toHaveCSS('text-decoration-line', 'line-through');
  await page.unroute(`**/api/plans/${week}/items/bulk`);
  await title.tap(); await expect(beans).toBeEnabled(); await expect(beans).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('restoring a shopping mistap preserves amounts already bought or at home', async ({ page }, testInfo) => {
  const week = '2026-10-12';
  expect((await page.request.post('/api/auth/register', { data: { email: `shopping-mixed-${Date.now()}-${Math.random()}@example.test`, password: 'synthetic-password123' } })).status()).toBe(201);
  for (const [amount, state] of [['2 cans', 'needed'], ['1 can', 'bought'], ['4 cans', 'have']]) {
    const response = await page.request.post(`/api/plans/${week}/items`, { data: { ingredient: 'Beans', amount } });
    expect(response.status()).toBe(201);
    const plan = await response.json();
    const id = plan.shopping.find((item: { amount: string }) => item.amount === amount).id;
    expect((await page.request.patch(`/api/plans/${week}/items/${id}`, { data: { state } })).ok()).toBe(true);
  }
  const accepted = await (await page.request.get(`/api/plans/${week}`)).json();
  await page.goto(`/shopping?week=${week}`);
  const row = page.getByRole('listitem').filter({ has: page.getByText('2 cans', { exact: true }) });
  const checkbox = row.getByRole('checkbox');
  await checkbox.check(); await expect(checkbox).toBeEnabled();
  await expect(checkbox).toBeVisible(); await expect(checkbox).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Purchased Beans', exact: true })).toHaveCount(2);
  await testInfo.attach('shopping-mixed-checks-phone', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await checkbox.uncheck(); await expect(checkbox).toBeEnabled();
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByRole('listitem').filter({ has: page.getByText('1 cans', { exact: true }) }).getByRole('checkbox')).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Already have Beans', exact: true })).toBeChecked();
  expect(await (await page.request.get(`/api/plans/${week}`)).json()).toEqual(accepted);
  // Also keep a newly added amount separate from an amount checked earlier in this visit.
  await checkbox.check(); await expect(checkbox).toBeEnabled();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByLabel('Item', { exact: true }).fill('Beans');
  await page.getByLabel('Amount (optional)').fill('7 cans');
  await page.getByRole('button', { name: 'Add extra item', exact: true }).click();
  const added = page.getByRole('listitem').filter({ has: page.getByText('7 cans', { exact: true }) }).getByRole('checkbox');
  await expect(added).toBeVisible();
  const beforeNewCheck = await (await page.request.get(`/api/plans/${week}`)).json();
  await added.check(); await expect(added).toBeEnabled(); await expect(added).toBeChecked();
  await added.uncheck(); await expect(added).toBeEnabled(); await expect(added).not.toBeChecked();
  await expect(checkbox).toBeChecked();
  expect(await (await page.request.get(`/api/plans/${week}`)).json()).toEqual(beforeNewCheck);
});

test('Monday opens a fresh shopping week without deleting or carrying over last week’s items', async ({ page }, testInfo) => {
  await page.clock.install({ time: new Date('2026-10-18T23:00:00-04:00') });
  const week = '2026-10-12'; const nextWeek = '2026-10-19';
  expect((await page.request.post('/api/auth/register', { data: { email: `shopping-week-${Date.now()}-${Math.random()}@example.test`, password: 'synthetic-password123' } })).status()).toBe(201);
  for (const ingredient of ['Apples', 'Rice']) expect((await page.request.post(`/api/plans/${week}/items`, { data: { ingredient } })).status()).toBe(201);
  await page.goto('/week');
  await page.getByRole('link', { name: 'Open shopping list', exact: true }).click();
  await expect(page).toHaveURL('/shopping');
  const apples = page.getByRole('checkbox', { name: 'Purchased Apples', exact: true });
  await apples.check(); await expect(apples).toBeEnabled();
  const accepted = await (await page.request.get(`/api/plans/${week}`)).json();
  await page.clock.fastForward('01:01:00');
  await expect(page.getByText(/Add recipes to your week/)).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  expect((await (await page.request.get(`/api/plans/${nextWeek}`)).json()).shopping).toHaveLength(0);
  expect(await (await page.request.get(`/api/plans/${week}`)).json()).toEqual(accepted);
  await testInfo.attach('shopping-new-week-phone', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('link', { name: 'Previous shopping week' }).click();
  await expect(apples).toBeVisible(); await expect(apples).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Purchased Rice', exact: true })).not.toBeChecked();
  await page.reload(); await expect(apples).toBeVisible(); await expect(apples).toBeChecked();
  await page.getByRole('link', { name: 'This week', exact: true }).click();
  await expect(page.getByText(/Add recipes to your week/)).toBeVisible();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByLabel('Item', { exact: true }).fill('Apples');
  await page.getByRole('button', { name: 'Add extra item', exact: true }).click();
  await expect(apples).toBeVisible(); await expect(apples).not.toBeChecked();
  expect(await (await page.request.get(`/api/plans/${week}`)).json()).toEqual(accepted);
});
