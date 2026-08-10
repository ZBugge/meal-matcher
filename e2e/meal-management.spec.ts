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
      await modal.locator('textarea[placeholder="e.g., Beef tacos with all the fixings"]').fill(description);
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
    await editModal.locator('textarea[placeholder="e.g., Beef tacos with all the fixings"]').fill('Updated description');
    await editModal.locator('button:has-text("Save")').click();

    // Then: Updated meal appears in the list
    await expect(page.locator('text=Updated Title')).toBeVisible();
    await expect(page.locator('text=Updated description')).toBeVisible();

    // And: Original title is no longer visible
    await expect(page.locator('text=Original Title')).not.toBeVisible();
  });

  test('host can save private recipe details and notes without exposing them to session participants', async ({ page, request }) => {
    const uniqueEmail = `test-recipe-${Date.now()}@example.com`;
    await registerAndGoToDashboard(page, uniqueEmail);

    await page.getByRole('button', { name: 'Add Meal' }).click();
    const addModal = page.locator('.card:has(h3:has-text("Add New Meal"))');
    await addModal.getByRole('button', { name: 'Paste a full recipe' }).click();
    await addModal.getByLabel('Recipe text to parse').fill(`Title: Garlic Soup
Description: Creamy roasted garlic soup
Ingredients:
2 bulbs | garlic
4oz | milk
Instructions:
Simmer until tender.`);
    await addModal.getByRole('button', { name: 'Fill recipe form' }).click();
    await expect(addModal.locator('input[placeholder="e.g., Tacos"]')).toHaveValue('Garlic Soup');
    await expect(addModal.getByLabel('Ingredient 2 name')).toHaveValue('milk');
    await addModal.getByRole('button', { name: 'Add Meal' }).click();

    await expect(page.getByText('Recipe · 2 ingredients')).toBeVisible();
    await page.reload();
    await page.getByTitle('Edit meal').click();
    const editModal = page.locator('.card:has(h3:has-text("Edit Meal"))');
    await expect(editModal.locator('textarea[placeholder="Describe how to make this meal"]'))
      .toHaveValue('Simmer until tender.');
    await expect(editModal.getByLabel('Ingredient 1 amount')).toHaveValue('2 bulbs');
    await expect(editModal.getByLabel('Ingredient 1 name')).toHaveValue('garlic');
    await expect(editModal.getByLabel('Ingredient 2 amount')).toHaveValue('4oz');
    await expect(editModal.getByLabel('Ingredient 2 name')).toHaveValue('milk');
    await editModal.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Notes' }).click();
    const notesDialog = page.getByRole('dialog', { name: 'Notes for Garlic Soup' });
    await notesDialog.getByLabel('Private notes').fill('Order extra crusty bread.');
    await notesDialog.getByRole('button', { name: 'Save notes' }).click();
    await expect(notesDialog).not.toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Notes' }).click();
    const reloadedNotesDialog = page.getByRole('dialog', { name: 'Notes for Garlic Soup' });
    await expect(reloadedNotesDialog.getByLabel('Private notes')).toHaveValue('Order extra crusty bread.');
    await reloadedNotesDialog.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Create Session' }).click();
    await page.getByRole('button', { name: 'Create (1 options)' }).click();
    const inviteUrl = await page.locator('input[readonly]').first().inputValue();
    const inviteCode = inviteUrl.split('/join/')[1];

    const joinResponse = await request.post(`/api/join/${inviteCode}`, {
      data: { displayName: 'Recipe privacy check' },
    });
    expect(joinResponse.ok()).toBe(true);
    const joinPayload = await joinResponse.json();
    expect(joinPayload.meals[0]).toMatchObject({ title: 'Garlic Soup' });
    expect(joinPayload.meals[0]).not.toHaveProperty('instructions');
    expect(joinPayload.meals[0]).not.toHaveProperty('ingredients');
    expect(joinPayload.meals[0]).not.toHaveProperty('notes');

    const sessionId = joinPayload.sessionId as string;
    const mealId = joinPayload.meals[0].id as string;
    const privateRecipe = await page.evaluate(async (id) => {
      const response = await fetch(`/api/meals/${id}`);
      return { status: response.status, body: await response.json() };
    }, mealId);
    expect(privateRecipe.status).toBe(200);
    expect(privateRecipe.body).toMatchObject({
      instructions: 'Simmer until tender.',
      notes: 'Order extra crusty bread.',
      ingredients: [
        { amount: '2 bulbs', ingredient: 'garlic' },
        { amount: '4oz', ingredient: 'milk' },
      ],
    });

    const unauthenticatedRecipe = await request.get(`/api/meals/${mealId}`);
    expect(unauthenticatedRecipe.status()).toBe(401);

    const swipeResponse = await request.post(`/api/swipes/${sessionId}`, {
      data: {
        participantId: joinPayload.participantId,
        swipes: [{ mealId, vote: 1 }],
      },
    });
    expect(swipeResponse.ok(), await swipeResponse.text()).toBe(true);

    const closeResponse = await page.evaluate(async (id) => {
      const response = await fetch(`/api/sessions/${id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return response.status;
    }, sessionId);
    expect(closeResponse).toBe(200);

    const selectResponse = await page.evaluate(async ({ id, selectedMealId }) => {
      const response = await fetch(`/api/sessions/${id}/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealId: selectedMealId }),
      });
      return response.status;
    }, { id: sessionId, selectedMealId: mealId });
    expect(selectResponse).toBe(200);

    const publicResults = await request.get(`/api/results/${sessionId}`);
    expect(publicResults.ok()).toBe(true);
    const publicResultsPayload = await publicResults.json();
    expect(publicResultsPayload.results[0]).not.toHaveProperty('instructions');
    expect(publicResultsPayload.results[0]).not.toHaveProperty('ingredients');
    expect(publicResultsPayload.results[0]).not.toHaveProperty('notes');

    await page.goto(`/results/${sessionId}`);
    await page.getByRole('button', { name: 'Garlic Soup' }).first().click();
    const resultsRecipe = page.getByRole('dialog', { name: 'Garlic Soup' });
    await expect(resultsRecipe.getByText('2 bulbs')).toBeVisible();
    await expect(resultsRecipe.getByText('Simmer until tender.')).toBeVisible();
    await resultsRecipe.getByRole('button', { name: 'Close recipe' }).click();

    await page.goto('/dashboard');
    const recentSessions = page.locator('section').filter({ hasText: 'Recent Sessions' });
    await recentSessions.getByRole('button', { name: 'Garlic Soup' }).click();
    await expect(page.getByRole('dialog', { name: 'Garlic Soup' })).toBeVisible();
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

    // When: User confirms deletion (button says "Confirm")
    await page.locator('button:has-text("Confirm")').click();

    // Wait for modal to close
    await expect(page.locator('text=Delete Meal?')).not.toBeVisible({ timeout: 5000 });

    // Then: Meal is no longer visible (check the card heading specifically)
    await expect(page.locator('h3:has-text("Meal To Delete")')).not.toBeVisible({ timeout: 5000 });
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

    // When: User confirms (button says "Confirm")
    await page.locator('button:has-text("Confirm")').click();

    // Wait for modal to close
    await expect(page.locator('text=/Delete 2 Meals/')).not.toBeVisible({ timeout: 5000 });

    // Then: Only the unselected meal remains
    await expect(page.getByText('Keep This One', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Bulk Delete 1', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Bulk Delete 2', { exact: true })).not.toBeVisible();
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
