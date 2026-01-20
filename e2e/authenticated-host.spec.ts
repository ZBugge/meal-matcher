import { test, expect } from '@playwright/test';

test.describe('Authenticated Host Flow', () => {
  // Helper to add a meal via the modal
  async function addMeal(page: import('@playwright/test').Page, title: string, description?: string) {
    await page.click('text=Add Meal');
    await expect(page.locator('h3:has-text("Add New Meal")')).toBeVisible();

    const modal = page.locator('.card:has(h3:has-text("Add New Meal"))');
    await modal.locator('input.input').fill(title);

    if (description) {
      await modal.locator('textarea.input').fill(description);
    }

    await modal.locator('button:has-text("Add Meal")').click();
    await expect(page.locator('h3:has-text("Add New Meal")')).not.toBeVisible();
  }

  test('full flow: register, create meals, start session, invite participant, get results', async ({ page, context }) => {
    const uniqueEmail = `host-${Date.now()}@example.com`;

    // Step 1: Register a new account
    await page.goto('/register');
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', 'testpassword123');
    await page.fill('#confirmPassword', 'testpassword123');
    await page.click('button[type="submit"]');

    // Then: User is redirected to dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=My Meals')).toBeVisible();

    // Step 2: Add meals to library
    await addMeal(page, 'Homemade Pizza', 'With pepperoni and mushrooms');
    await addMeal(page, 'Thai Curry', 'Green curry with rice');
    await addMeal(page, 'Grilled Salmon');

    // Then: All meals are visible
    await expect(page.locator('text=Homemade Pizza')).toBeVisible();
    await expect(page.locator('text=Thai Curry')).toBeVisible();
    await expect(page.locator('text=Grilled Salmon')).toBeVisible();

    // Step 3: Create a session from saved meals
    await page.click('button:has-text("Create Session")');

    // Then: Modal shows meals to select
    await expect(page.locator('text=Select meals to include')).toBeVisible();

    // All meals are pre-selected, just create the session
    await page.click('button:has-text("Create (3 meals)")');

    // Then: Redirected to session view
    await expect(page).toHaveURL(/\/session\/.*/);
    await expect(page.locator('text=Invite Link')).toBeVisible();

    // Step 4: Get invite code and join as participant
    const inviteInput = page.locator('input[readonly]').first();
    const inviteUrl = await inviteInput.inputValue();
    const inviteCode = inviteUrl.split('/join/')[1];

    // Open participant in new tab
    const participantPage = await context.newPage();
    await participantPage.goto(`/join/${inviteCode}`);

    // Participant enters name
    await participantPage.fill('#name', 'Family Member');
    await participantPage.click('text=Start Swiping');

    // Participant swipes
    await participantPage.locator('[data-testid="swipe-yes"]').click();
    await participantPage.locator('[data-testid="swipe-no"]').click();
    await participantPage.locator('[data-testid="swipe-yes"]').click();

    // Participant sees results
    await expect(participantPage).toHaveURL(/\/results\//, { timeout: 5000 });

    // Step 5: Host joins directly via the link (open in new context page, not popup)
    const hostSwipePage = await context.newPage();
    await hostSwipePage.goto(`/join/${inviteCode}`);

    // Host enters name and swipes
    await hostSwipePage.fill('#name', 'Host');
    await hostSwipePage.click('text=Start Swiping');

    await hostSwipePage.locator('[data-testid="swipe-yes"]').click();
    await hostSwipePage.locator('[data-testid="swipe-yes"]').click();
    await hostSwipePage.locator('[data-testid="swipe-no"]').click();

    // Host sees results
    await expect(hostSwipePage).toHaveURL(/\/results\//, { timeout: 5000 });

    // Step 6: Back to main page, close session to see results
    await page.reload();
    await page.click('text=Close Session');

    // Then: Results section appears
    await expect(page.locator('h2:has-text("Results")')).toBeVisible({ timeout: 5000 });

    // And: Can see vote percentages
    await expect(page.locator('text=/%/')).toBeVisible();
  });

  test('host can quick add meals while creating session', async ({ page }) => {
    const uniqueEmail = `quick-add-${Date.now()}@example.com`;

    // Register and go to dashboard
    await page.goto('/register');
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', 'testpassword123');
    await page.fill('#confirmPassword', 'testpassword123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // Add one meal first
    await addMeal(page, 'Existing Meal');

    // Open create session modal
    await page.click('button:has-text("Create Session")');

    // Quick add a new meal from the modal (input has placeholder "e.g., Pizza")
    const sessionModal = page.locator('.card:has(h3:has-text("Create Session"))');
    await sessionModal.locator('input[placeholder="e.g., Pizza"]').fill('Quick Added Meal');
    await sessionModal.locator('button:has-text("Add")').click();

    // Wait for the meal to appear in the list
    await expect(sessionModal.locator('label:has-text("Quick Added Meal")')).toBeVisible();

    // Both meals should be selected
    await expect(sessionModal.locator('label:has-text("Quick Added Meal") input[type="checkbox"]')).toBeChecked();
    await expect(sessionModal.locator('label:has-text("Existing Meal") input[type="checkbox"]')).toBeChecked();

    // Create the session
    await page.click('button:has-text("Create (2 meals)")');

    // Then: Session is created with both meals
    await expect(page).toHaveURL(/\/session\/.*/);
    await expect(page.locator('text=Meals in Session (2)')).toBeVisible();
  });

  test('host can login and access previous meals', async ({ page }) => {
    const uniqueEmail = `persist-${Date.now()}@example.com`;

    // Register and add a meal
    await page.goto('/register');
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', 'testpassword123');
    await page.fill('#confirmPassword', 'testpassword123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    await addMeal(page, 'Persisted Meal');
    await expect(page.locator('text=Persisted Meal')).toBeVisible();

    // Sign out
    await page.click('text=Sign out');
    await expect(page).toHaveURL('/login');

    // Log back in
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', 'testpassword123');
    await page.click('button[type="submit"]');

    // Then: Previous meal is still there
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=Persisted Meal')).toBeVisible();
  });

  test('host sees session history on dashboard', async ({ page }) => {
    const uniqueEmail = `history-${Date.now()}@example.com`;

    // Register
    await page.goto('/register');
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', 'testpassword123');
    await page.fill('#confirmPassword', 'testpassword123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');

    // Add a meal and create a session
    await addMeal(page, 'History Test Meal');

    await page.click('button:has-text("Create Session")');
    await page.click('button:has-text("Create (1 meals)")');

    // Should be on session view now
    await expect(page).toHaveURL(/\/session\/.*/);

    // Get the invite code
    const inviteCode = await page.locator('.font-mono.font-bold').first().textContent();

    // Go back to dashboard
    await page.click('text=Dashboard');

    // Then: Session appears in Recent Sessions
    await expect(page.locator('text=Recent Sessions')).toBeVisible();
    await expect(page.locator(`text=${inviteCode}`)).toBeVisible();
    await expect(page.locator('.bg-green-100:has-text("open")')).toBeVisible();
  });
});
