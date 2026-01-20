import { test, expect } from '@playwright/test';

test.describe('Meal Management (#17, #12)', () => {
  // Helper to register and get to dashboard
  async function registerAndGoToDashboard(page: import('@playwright/test').Page, email: string) {
    await page.goto('/register');
    await page.fill('#email', email);
    await page.fill('#password', 'testpassword123');
    await page.fill('#confirmPassword', 'testpassword123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  }

  // Helper to add a meal via the modal
  async function addMeal(page: import('@playwright/test').Page, title: string, description?: string) {
    await page.click('text=Add Meal');
    await expect(page.locator('h3:has-text("Add New Meal")')).toBeVisible();

    // Fill the title input (first input in the modal)
    const modal = page.locator('.card:has(h3:has-text("Add New Meal"))');
    await modal.locator('input.input').fill(title);

    if (description) {
      await modal.locator('textarea.input').fill(description);
    }

    await modal.locator('button:has-text("Add Meal")').click();

    // Wait for modal to close
    await expect(page.locator('h3:has-text("Add New Meal")')).not.toBeVisible();
  }

  test('user can edit meal title and description (#17)', async ({ page }) => {
    const uniqueEmail = `test-edit-${Date.now()}@example.com`;
    await registerAndGoToDashboard(page, uniqueEmail);

    // Given: User adds a meal
    await addMeal(page, 'Original Title', 'Original description');

    // Then: Meal appears in the list
    await expect(page.locator('text=Original Title')).toBeVisible();
    await expect(page.locator('text=Original description')).toBeVisible();

    // When: User clicks the edit button (pencil icon)
    await page.locator('button[title="Edit meal"]').first().click();

    // Then: Edit modal appears
    await expect(page.locator('h3:has-text("Edit Meal")')).toBeVisible();

    // When: User changes title and description
    const editModal = page.locator('.card:has(h3:has-text("Edit Meal"))');
    await editModal.locator('input.input').fill('Updated Title');
    await editModal.locator('textarea.input').fill('Updated description');
    await editModal.locator('button:has-text("Save")').click();

    // Then: Updated meal appears in the list
    await expect(page.locator('text=Updated Title')).toBeVisible();
    await expect(page.locator('text=Updated description')).toBeVisible();

    // And: Original title is no longer visible
    await expect(page.locator('text=Original Title')).not.toBeVisible();
  });

  test('user can delete single meal with confirmation (#12)', async ({ page }) => {
    const uniqueEmail = `test-delete-${Date.now()}@example.com`;
    await registerAndGoToDashboard(page, uniqueEmail);

    // Given: User adds a meal
    await addMeal(page, 'Meal To Delete');
    await expect(page.locator('text=Meal To Delete')).toBeVisible();

    // When: User clicks delete button (trash icon)
    await page.locator('button[title="Archive meal"]').first().click();

    // Then: Confirmation modal appears
    await expect(page.locator('text=Delete Meal?')).toBeVisible();
    await expect(page.locator('text=/Are you sure you want to delete "Meal To Delete"/')).toBeVisible();

    // When: User confirms deletion
    await page.locator('button:has-text("Delete"):not(:has-text("Cancel"))').click();

    // Then: Meal is no longer visible
    await expect(page.locator('text=Meal To Delete')).not.toBeVisible({ timeout: 5000 });
  });

  test('user can cancel meal deletion', async ({ page }) => {
    const uniqueEmail = `test-cancel-${Date.now()}@example.com`;
    await registerAndGoToDashboard(page, uniqueEmail);

    // Given: User adds a meal
    await addMeal(page, 'Meal To Keep');
    await expect(page.locator('text=Meal To Keep')).toBeVisible();

    // When: User clicks delete and then cancels
    await page.locator('button[title="Archive meal"]').first().click();
    await expect(page.locator('text=Delete Meal?')).toBeVisible();
    await page.click('button:has-text("Cancel")');

    // Then: Meal is still visible
    await expect(page.locator('text=Meal To Keep')).toBeVisible();
  });

  test('user can multiselect and bulk delete meals (#12)', async ({ page }) => {
    const uniqueEmail = `test-bulk-${Date.now()}@example.com`;
    await registerAndGoToDashboard(page, uniqueEmail);

    // Given: User adds multiple meals
    await addMeal(page, 'Bulk Delete 1');
    await addMeal(page, 'Bulk Delete 2');
    await addMeal(page, 'Keep This One');

    // When: User enters edit mode
    await page.click('button:has-text("Edit")');

    // Then: Checkboxes appear
    await expect(page.locator('.card input[type="checkbox"]').first()).toBeVisible();

    // When: User selects two meals for deletion (newest first, so Keep This One is first)
    const checkboxes = page.locator('.card input[type="checkbox"]');
    // Select "Bulk Delete 2" (second checkbox) and "Bulk Delete 1" (third checkbox)
    await checkboxes.nth(1).check();
    await checkboxes.nth(2).check();

    // Then: Delete Selected button shows count
    await expect(page.locator('text=Delete Selected (2)')).toBeVisible();

    // When: User clicks Delete Selected
    await page.click('text=Delete Selected (2)');

    // Then: Confirmation modal shows
    await expect(page.locator('text=/Delete 2 Meals/')).toBeVisible();

    // When: User confirms
    await page.locator('button:has-text("Delete"):not(:has-text("Cancel"))').click();

    // Then: Only the unselected meal remains
    await expect(page.locator('text=Keep This One')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Bulk Delete 1')).not.toBeVisible();
    await expect(page.locator('text=Bulk Delete 2')).not.toBeVisible();
  });

  test('edit mode can be toggled on and off', async ({ page }) => {
    const uniqueEmail = `test-toggle-${Date.now()}@example.com`;
    await registerAndGoToDashboard(page, uniqueEmail);

    // Given: User adds a meal
    await addMeal(page, 'Test Meal');

    // When: User clicks Edit
    await page.click('button:has-text("Edit")');

    // Then: Done button appears and checkboxes visible
    await expect(page.locator('button:has-text("Done")')).toBeVisible();
    await expect(page.locator('.card input[type="checkbox"]')).toBeVisible();

    // When: User clicks Done
    await page.click('button:has-text("Done")');

    // Then: Edit button reappears and checkboxes are gone
    await expect(page.locator('button:has-text("Edit")')).toBeVisible();
    await expect(page.locator('.card input[type="checkbox"]')).not.toBeVisible();
  });
});
