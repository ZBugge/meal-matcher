import { expect, test } from '@playwright/test';

test.describe('Home and takeout session modes', () => {
  test('anonymous quick sessions default to takeout suggestions', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Food Categories')).toBeVisible();
    await page.getByLabel('Your Name').fill('Takeout Tester');
    await page.getByRole('button', { name: 'Pizza' }).click();
    await expect(page.getByPlaceholder('Option 1')).toHaveValue('Pizza');

    await page.getByRole('button', { name: 'Create Session' }).click();
    await expect(page).toHaveURL(/\/session\/[^/]+\/share/);
    await expect(page.getByText('order-out vote')).toBeVisible();
  });

  test('authenticated takeout categories persist and create a takeout session', async ({ page }) => {
    const email = `takeout-${Date.now()}@example.com`;

    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm Password').fill('password123');
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL('/dashboard');

    await page.getByRole('button', { name: 'Takeout' }).click();
    await page.getByRole('button', { name: 'Start with popular categories' }).click();
    const onboardingModal = page.locator('.card:has(h3:has-text("Start with popular categories"))');
    const mexican = onboardingModal.getByRole('checkbox', { name: 'Mexican' });
    await mexican.check();
    await expect(mexican).toBeChecked();
    await mexican.uncheck();
    await expect(mexican).not.toBeChecked();
    await mexican.check();
    await onboardingModal.getByRole('button', { name: 'Add selected (1)' }).click();
    await expect(page.getByText('Mexican')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Takeout' }).click();
    await expect(page.getByText('Mexican')).toBeVisible();

    await page.getByRole('button', { name: 'Create Session' }).click();
    await expect(page.getByText('Quick add category')).toBeVisible();
    await page.getByRole('button', { name: 'Create (1 options)' }).click();

    await expect(page).toHaveURL(/\/session\/[^/]+$/);
    await expect(page.getByText('Order out')).toBeVisible();
    await expect(page.getByText('Options in Session (1)')).toBeVisible();

    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Takeout' }).click();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Delete Selected (1)' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('No takeout categories yet. Add your favorites to get started!')).toBeVisible();
    await expect(page.getByText('Build your takeout list')).not.toBeVisible();
  });
});
