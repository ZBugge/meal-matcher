import { test, expect, type Page } from '@playwright/test';

async function itemStatus(page: Page, name: string) {
  const status = page.getByLabel(`Status for ${name}`, { exact: true });
  await expect(status).toBeAttached();
  await expect(status).toBeEnabled();
  if (!await status.isVisible()) {
    const details = page.getByText(`Details & edit ${name}`, { exact: true });
    if (!await details.isVisible()) await page.getByText(/^Completed \(/).click();
    if (!await details.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await details.click();
  }
  return status;
}

test('family week survives reload and shares shopping and cooking across phones', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = `family-${Date.now()}-${Math.random()}@example.com`;
  const password = 'family-password123';
  await page.goto('/register');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#confirmPassword').fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page).toHaveURL('/week');
  // Seed through the real authenticated API so this scenario focuses on the family flow.
  const soup = await page.request.post('/api/meals', { data: { title: 'Sunday soup', type: 'meal', instructions: '1. Rinse the beans.\n2. Simmer for 20 minutes.', ingredients: [{ amount: '2 cans', ingredient: 'Beans' }, { amount: '1 bag', ingredient: 'Spinach' }] } });
  expect(soup.ok()).toBeTruthy();
  const soupId = (await soup.json()).id;
  const pasta = await page.request.post('/api/meals', { data: { title: 'Simple pasta', type: 'meal', instructions: 'Boil and serve.', ingredients: [{ amount: '500 g', ingredient: 'Pasta' }] } });
  expect(pasta.ok()).toBeTruthy();
  await page.goto('/dashboard?week=2026-10-12');
  await page.getByRole('button', { name: 'Show library', exact: true }).click();
  await page.getByRole('button', { name: 'Add Sunday soup to this week', exact: true }).click();
  await page.getByRole('button', { name: 'Add Simple pasta to this week', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Added · View week' })).toHaveCount(2);
  await page.getByRole('link', { name: 'Added · View week' }).first().click();
  await expect(page.getByRole('heading', { name: 'Sunday soup' })).toBeVisible();
  await page.getByLabel('Night for Sunday soup').selectOption('2026-10-14');
  await expect(page.getByLabel('Night for Sunday soup')).toBeEnabled();
  await page.getByLabel('What sounds good?').fill('Friday pizza');
  await page.getByRole('button', { name: 'Add takeout night' }).click();
  await expect(page.getByRole('heading', { name: 'Friday pizza' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Night for Sunday soup')).toHaveValue('2026-10-14');
  await expect(page.getByRole('heading', { name: 'Simple pasta' })).toBeVisible();
  await page.getByRole('link', { name: 'Shopping list', exact: true }).click();
  await (await itemStatus(page, 'Beans')).selectOption('have');
  await expect((await itemStatus(page, 'Beans'))).toBeEnabled();
  await (await itemStatus(page, 'Spinach')).selectOption('bought');
  await expect((await itemStatus(page, 'Spinach'))).toBeEnabled();
  await page.getByLabel('Item', { exact: true }).fill('Apples');
  await page.getByLabel('Amount (optional)').fill('6');
  await page.getByRole('button', { name: 'Add extra item' }).click();
  await expect((await itemStatus(page, 'Apples'))).toBeVisible();
  await expect(page.getByLabel('List to copy')).toHaveValue('500 g Pasta\n6 Apples');
  await page.reload();
  await expect((await itemStatus(page, 'Beans'))).toHaveValue('have');
  await expect((await itemStatus(page, 'Spinach'))).toHaveValue('bought');
  await expect((await itemStatus(page, 'Apples'))).toBeVisible();
  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const phone = await secondContext.newPage();
    await phone.goto('/login');
    await phone.locator('#email').fill(email);
    await phone.locator('#password').fill(password);
    await phone.getByRole('button', { name: 'Sign In' }).click();
    await expect(phone).toHaveURL('/week');
    await phone.goto('/shopping?week=2026-10-12');
    await expect((await itemStatus(phone, 'Beans'))).toHaveValue('have');
    await expect((await itemStatus(phone, 'Spinach'))).toHaveValue('bought');
    await (await itemStatus(phone, 'Apples')).selectOption('bought');
    await expect((await itemStatus(phone, 'Apples'))).toBeEnabled();
    await page.reload();
    await expect((await itemStatus(page, 'Apples'))).toHaveValue('bought');
    await phone.goto('/week?week=2026-10-12');
    await phone.getByRole('article').filter({ has: phone.getByRole('heading', { name: 'Sunday soup', exact: true }) }).getByRole('link', { name: 'Cook recipe' }).click();
    await expect(phone).toHaveURL(new RegExp(`/cook/${soupId}`));
    await expect(phone.getByRole('heading', { name: 'Sunday soup', exact: true })).toBeVisible();
    await expect(phone.getByText('1. Rinse the beans.')).toBeVisible();
    await phone.getByRole('checkbox', { name: '2 cans Beans' }).check();
    await phone.getByRole('link', { name: 'Back to week plan' }).click();
    await phone.getByRole('button', { name: 'Remove Sunday soup', exact: true }).click();
    await phone.getByRole('button', { name: 'Remove dinner and unpurchased groceries' }).click();
    await expect(phone.getByRole('heading', { name: 'Sunday soup', exact: true })).not.toBeVisible();
    await phone.goto('/shopping?week=2026-10-12');
    await expect(phone.getByText('Details & edit Beans', { exact: true })).not.toBeVisible();
    await expect((await itemStatus(phone, 'Spinach'))).toHaveValue('bought');
    await expect((await itemStatus(phone, 'Pasta'))).toBeVisible();
    await expect((await itemStatus(phone, 'Apples'))).toHaveValue('bought');
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await secondContext.close(); }
});


test('phone plans tonight, saves dinner staples, repeats reviewed meals and shops consolidated groceries', async ({ page, browser }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = `week-shopping-${Date.now()}-${Math.random()}@example.com`; const password = 'family-password123';
  await page.goto('/register'); await page.locator('#email').fill(email); await page.locator('#password').fill(password); await page.locator('#confirmPassword').fill(password); await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page).toHaveURL('/week');
  const now = new Date(); const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const week = iso(monday); const target = new Date(monday); target.setDate(target.getDate() + 7); const targetWeek = iso(target);
  for (const [title, amount, ingredient] of [['Salmon bowls', '2 cans', 'Beans'], ['Asian tofu', '1 can', '  beans  ']]) {
    expect((await page.request.post('/api/meals', { data: { title, instructions: 'Cook gently.', ingredients: [{ amount, ingredient }, { amount: 'a handful', ingredient: 'Spinach' }] } })).ok()).toBeTruthy();
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tonight', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Salmon bowls', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Add meal', exact: true }).click();
  await page.getByLabel('Search recipes').fill('Salmon'); await page.getByRole('button', { name: 'Add Salmon bowls', exact: true }).click();
  await page.getByRole('button', { name: 'Make Salmon bowls tonight', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Tonight', exact: true }).getByRole('heading', { name: 'Salmon bowls' })).toBeVisible();
  // Removing tonight must open within the existing viewport and trap focus immediately.
  const beforeCancel = await (await page.request.get(`/api/plans/${week}`)).json();
  const boughtId = beforeCancel.shopping[0].id;
  expect((await page.request.patch(`/api/plans/${week}/items/${boughtId}`, { data: { state: 'bought' } })).ok()).toBeTruthy();
  const accepted = await (await page.request.get(`/api/plans/${week}`)).json();
  const removeTonight = page.getByRole('region', { name: 'Tonight', exact: true }).getByRole('button', { name: 'Remove Salmon bowls', exact: true });
  await removeTonight.click();
  const removal = page.getByRole('dialog', { name: 'Remove Salmon bowls?' });
  await expect(removal.getByRole('button', { name: 'Cancel removal' })).toBeFocused();
  const bounds = await removal.boundingBox(); expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await testInfo.attach('remove-dinner-phone', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape'); await expect(removal).not.toBeVisible(); await expect(removeTonight).toBeFocused();
  expect(await (await page.request.get(`/api/plans/${week}`)).json()).toEqual(accepted);
  await removeTonight.click(); await removal.getByRole('button', { name: 'Cancel removal' }).click(); await expect(removeTonight).toBeFocused();
  await page.getByText('Weekly dinner staples', { exact: true }).click();
  await page.getByLabel('Dinner staple name').fill('Tofu night'); await page.getByRole('button', { name: 'Add dinner staple' }).click();
  await page.getByRole('button', { name: 'Edit Tofu night', exact: true }).click(); await page.getByLabel('Dinner staple name').fill('Asian tofu'); await page.getByRole('button', { name: 'Save staple', exact: true }).click();
  await page.getByRole('button', { name: 'Choose recipe for Asian tofu' }).click(); await page.getByRole('button', { name: 'Add Asian tofu', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Flexible meals' }).getByRole('heading', { name: 'Asian tofu' })).toBeVisible();
  await page.reload(); await page.getByText('Weekly dinner staples', { exact: true }).click(); await expect(page.getByRole('button', { name: 'Choose recipe for Asian tofu' })).toBeVisible();
  await testInfo.attach('week-phone', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  // Copy selected meals into a nonempty week; source remains intact.
  expect((await page.request.post(`/api/plans/${targetWeek}/entries`, { data: { kind: 'takeout', title: 'Existing pizza' } })).ok()).toBeTruthy();
  await page.getByText('Repeat a week', { exact: true }).click(); await page.getByRole('button', { name: 'Choose meals to repeat' }).click(); await page.getByLabel('Target Monday').fill(targetWeek); await page.getByRole('button', { name: 'Repeat selected meals' }).click(); await page.getByRole('link', { name: 'View repeated week' }).click();
  await expect(page.getByRole('heading', { name: 'Existing pizza' })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Tonight', exact: true })).not.toBeVisible();
  const copied = await (await page.request.get(`/api/plans/${targetWeek}`)).json();
  const source = await (await page.request.get(`/api/plans/${week}`)).json();
  expect(copied.entries).toHaveLength(3); expect(source.entries).toHaveLength(2);
  expect(copied.shopping.every((row: { state: string }) => row.state === 'needed')).toBe(true);
  await page.getByRole('link', { name: 'Shopping list', exact: true }).click();
  await expect(page.getByText('3 cans Beans', { exact: true })).toBeVisible(); await expect(page.getByText('Salmon bowls / Asian tofu', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Review pantry' }).click(); await page.getByRole('checkbox', { name: 'Already have Beans', exact: true }).check(); await page.getByRole('button', { name: 'Already have selected (2)' }).click();
  await page.getByRole('button', { name: 'Finish pantry review' }).click(); await page.getByRole('checkbox', { name: 'Purchased Spinach', exact: true }).check();
  await page.getByLabel('Item', { exact: true }).fill('Mystery sauce'); await page.getByRole('button', { name: 'Add extra item' }).click();
  const sauceStatus = await itemStatus(page, 'Mystery sauce'); await expect(sauceStatus).toHaveValue('needed');
  await page.getByRole('button', { name: 'Edit Mystery sauce', exact: true }).click(); await page.getByLabel('Aisle for Mystery sauce').selectOption('Pantry'); await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Pantry', exact: true })).toBeVisible(); await expect(page.getByLabel('List to copy')).toHaveValue('Mystery sauce');
  await testInfo.attach('shop-phone', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('link', { name: 'Week plan', exact: true }).click(); await page.getByRole('button', { name: 'Remove Salmon bowls', exact: true }).click(); await page.getByRole('button', { name: 'Keep groceries', exact: true }).click();
  const kept = await (await page.request.get(`/api/plans/${targetWeek}`)).json(); expect(kept.shopping.filter((row: { entryId: string | null; sourceTitle: string }) => row.entryId === null && row.sourceTitle === 'Salmon bowls')).toHaveLength(2);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const phone = await context.newPage(); await phone.goto('/login'); await phone.locator('#email').fill(email); await phone.locator('#password').fill(password); await phone.getByRole('button', { name: 'Sign In' }).click();
    await phone.getByText('Weekly dinner staples', { exact: true }).click(); await expect(phone.getByRole('button', { name: 'Choose recipe for Asian tofu' })).toBeVisible(); await phone.getByRole('button', { name: 'Remove staple Asian tofu' }).click(); await phone.reload(); await phone.getByText('Weekly dinner staples', { exact: true }).click(); await expect(phone.getByRole('button', { name: 'Choose recipe for Asian tofu' })).not.toBeVisible();
    await phone.goto(`/shopping?week=${targetWeek}`); await expect(phone.getByText('Completed (2)', { exact: true })).toBeVisible(); await expect(phone.getByRole('heading', { name: 'Pantry', exact: true })).toBeVisible();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { await context.close(); }
});
