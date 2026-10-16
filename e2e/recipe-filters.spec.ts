import { test, expect } from '@playwright/test';

test('phone recipe metadata persists and filters compose after reopening', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register');
  await page.locator('#email').fill(`recipe-filters-${Date.now()}-${Math.random()}@example.com`);
  await page.locator('#password').fill('family-password123');
  await page.locator('#confirmPassword').fill('family-password123');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page).toHaveURL('/week');
  for (const data of [{title: 'Slow soup', totalMinutes: 60, effort: 'involved'}, {title: 'Unknown dinner'}]) {
    expect((await page.request.post('/api/meals', {data})).ok()).toBeTruthy();
  }
  await page.goto('/recipes');
  await page.getByRole('button', {name: 'Add recipe', exact: true}).click();
  await page.getByLabel('Title', {exact: true}).fill('Quick soup');
  await page.getByLabel('Total time (minutes)', {exact: true}).fill('15');
  await page.getByLabel('Effort', {exact: true}).selectOption('easy');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await testInfo.attach('recipe-metadata-editor-phone', {body: await page.screenshot({fullPage: true}), contentType: 'image/png'});
  await page.getByRole('button', {name: 'Add Meal', exact: true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', {name: /Quick soup/}).click();
  await page.getByRole('button', {name: 'Edit recipe', exact: true}).click();
  await expect(page.getByLabel('Total time (minutes)')).toHaveValue('15');
  await expect(page.getByLabel('Effort', {exact: true})).toHaveValue('easy');
  await page.getByLabel('Title', {exact: true}).fill('Quick bean soup');
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', {name: /Quick bean soup/}).click();
  await page.getByRole('button', {name: 'Read recipe', exact: true}).click();
  await expect(page.getByRole('dialog').last().getByText('15 min · Easy effort')).toBeVisible();
  await testInfo.attach('recipe-metadata-reader-phone', {body: await page.screenshot({fullPage: true}), contentType: 'image/png'});
  await page.getByRole('button', {name: 'Close recipe', exact: true}).click();
  await page.getByRole('button', {name: 'Close Quick bean soup', exact: true}).click();
  await page.getByLabel('Maximum total time').selectOption('15');
  await page.getByLabel('Filter by effort').selectOption('easy');
  await page.getByLabel('Search your recipes').fill('bean');
  await expect(page.getByRole('button', {name: /Quick bean soup/})).toBeVisible();
  await expect(page.getByRole('button', {name: /Slow soup/})).toHaveCount(0);
  await expect(page.getByRole('button', {name: /Unknown dinner/})).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await testInfo.attach('recipe-filters-phone', {body: await page.screenshot({fullPage: true}), contentType: 'image/png'});
  await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
  await expect(page.getByRole('button', {name: /Unknown dinner/})).toBeVisible();
  await expect(page.getByRole('button', {name: /Slow soup/})).toBeVisible();
});
