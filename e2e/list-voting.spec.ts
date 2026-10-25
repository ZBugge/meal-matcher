import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('a long list preserves selections, details, and edits across phones', async ({ page, browser }) => {
  expect((await page.request.post('/api/auth/register', { data: {
    email: `list-${randomUUID()}@test.local`, password: 'family-test-password',
  } })).status()).toBe(201);
  const response = await page.request.post('/api/quick-session', { data: {
    creatorName: 'Alex', mode: 'home',
    meals: Array.from({ length: 35 }, (_, i) => ({ title: `Dinner ${i + 1}`, description: `Description ${i + 1}` })),
  } });
  expect(response.ok()).toBe(true);
  const quick = await response.json();
  await page.goto(`/join/${quick.session.inviteCode}`);
  await page.locator('#name').fill('Sam');
  await page.getByRole('button', { name: /Start voting|Start Swiping/i }).click();
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('checkbox', { name: 'Dinner 1', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Dinner 35', exact: true }).check();
  const details = page.getByLabel('Details for Dinner 35', { exact: true });
  await details.click();
  await expect(page.getByText('Description 35', { exact: true })).toBeVisible();
  const scroll = await page.getByLabel('Meal choices', { exact: true }).evaluate(el => el.scrollTop);
  await details.click();
  expect(await page.getByLabel('Meal choices', { exact: true }).evaluate(el => el.scrollTop)).toBe(scroll);
  const submit = page.getByRole('button', { name: 'Submit Votes', exact: true });
  expect(await submit.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })).toBe(true);
  await test.info().attach('phone-list-voting', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Dinner 1', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Dinner 35', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Submit Votes', exact: true }).click();
  await expect(page).toHaveURL(/\/results\//);
  await page.getByRole('button', { name: 'Update Your Choices' }).click();
  await expect(page.getByRole('checkbox', { name: 'Dinner 35', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Dinner 35', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Submit Votes', exact: true }).click();
  await expect(page).toHaveURL(/\/results\//);
  const partner = await browser.newPage({ baseURL: test.info().project.use.baseURL });
  try {
    await partner.goto(`/join/${quick.session.inviteCode}`);
    await partner.locator('#name').fill('Jamie');
    await partner.getByRole('button', { name: /Start voting|Start Swiping/i }).click();
    await partner.getByRole('checkbox', { name: 'Dinner 1', exact: true }).check();
    await partner.getByRole('button', { name: 'Submit Votes', exact: true }).click();
    await expect(partner).toHaveURL(/\/results\//);
    expect((await page.request.post(`/api/sessions/${quick.session.id}/close`)).ok()).toBe(true);
    await page.reload();
    const agreed = page.locator('.card').filter({ has: page.getByRole('button', { name: 'Dinner 1', exact: true }) });
    await expect(agreed).toContainText('2 yes / 2 total');
    const rejected = page.locator('.card').filter({ has: page.getByRole('button', { name: 'Dinner 35', exact: true }) });
    await expect(rejected).toContainText('0 yes / 2 total');
  } finally { await partner.close(); }
});

test('list submission preserves all-No ballots and requires explicit retry after failure', async ({ page }) => {
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.getByPlaceholder('Option 1').fill('Pizza');
  await page.getByRole('button', { name: 'Create Session', exact: true }).click();
  await page.getByRole('button', { name: /Start voting|Start Swiping/i }).click();
  let submissions = 0;
  await page.route('**/api/swipes/*', async route => {
    submissions++;
    expect(route.request().postDataJSON().swipes).toEqual([expect.objectContaining({ vote: 0 })]);
    if (submissions === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Try again when connected.' }) });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Submit Votes', exact: true }).click();
  await expect(page.getByText('Try again when connected.')).toBeVisible();
  await page.waitForTimeout(500);
  expect(submissions).toBe(1);
  await page.getByRole('button', { name: 'Retry Submission' }).click();
  await expect(page).toHaveURL(/\/results\//);
  expect(submissions).toBe(2);
});
