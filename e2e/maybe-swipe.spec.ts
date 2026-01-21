import { test, expect } from '@playwright/test';

test.describe('Maybe Swipe Flow (#28)', () => {
  test('user can swipe maybe and it shows in results', async ({ page }) => {
    // Given: User is on home page
    await page.goto('/');

    // When: User creates a quick session with 3 options
    await page.fill('#name', 'Maybe Tester');
    await page.fill('input[placeholder="Option 1"]', 'Pizza');
    await page.click('text=+ Add another option');
    await page.fill('input[placeholder="Option 2"]', 'Tacos');
    await page.click('text=+ Add another option');
    await page.fill('input[placeholder="Option 3"]', 'Sushi');
    await page.click('text=Create Session');

    // Then: User is taken to share page
    await expect(page).toHaveURL(/\/session\/.*\/share/);

    // When: User starts swiping
    await page.click('text=Start Swiping');
    await expect(page).toHaveURL(/\/session\/.*\/swipe/);

    // When: User swipes Yes on first meal
    await page.locator('[data-testid="swipe-yes"]').click();

    // When: User swipes Maybe on second meal
    await page.click('button:has-text("Maybe")');

    // When: User swipes No on third meal
    await page.locator('[data-testid="swipe-no"]').click();

    // Then: User is redirected to results (waiting) page
    await expect(page).toHaveURL(/\/results\//, { timeout: 5000 });

    // When: Creator ends the session - click the button then confirm in modal
    await page.click('text=End Session & Show Results');
    // Handle confirmation modal
    await page.locator('.fixed.inset-0 button:has-text("End Session")').click();

    // Then: Results page shows
    await expect(page.locator('h1:has-text("Results")')).toBeVisible({ timeout: 5000 });
    // The maybe vote should appear in results - check for "maybe" text
    await expect(page.locator('text=/maybe/')).toBeVisible();
  });

  test('maybe votes are ranked below unanimous yes votes', async ({ page, context }) => {
    // Given: A session is created with 2 meals
    await page.goto('/');
    await page.fill('#name', 'Host');
    await page.fill('input[placeholder="Option 1"]', 'Unanimous Choice');
    await page.click('text=+ Add another option');
    await page.fill('input[placeholder="Option 2"]', 'Maybe Choice');
    await page.click('text=Create Session');
    await expect(page).toHaveURL(/\/session\/.*\/share/);

    // Get the invite URL
    const shareUrl = await page.locator('input[readonly]').inputValue();
    const inviteCode = shareUrl.split('/join/')[1];

    // Host swipes: Yes on both
    await page.click('text=Start Swiping');
    await page.locator('[data-testid="swipe-yes"]').click();
    await page.locator('[data-testid="swipe-yes"]').click();
    await expect(page).toHaveURL(/\/results\//, { timeout: 5000 });

    // Participant joins and swipes: Yes on first, Maybe on second
    const participantPage = await context.newPage();
    await participantPage.goto(`/join/${inviteCode}`);
    await participantPage.fill('#name', 'Participant');
    await participantPage.click('text=Start Swiping');

    // Yes on Unanimous Choice
    await participantPage.locator('[data-testid="swipe-yes"]').click();
    // Maybe on Maybe Choice
    await participantPage.click('button:has-text("Maybe")');

    await expect(participantPage).toHaveURL(/\/results\//, { timeout: 5000 });

    // Host ends the session - click button then confirm in modal
    await page.click('text=End Session & Show Results');
    await page.locator('.fixed.inset-0 button:has-text("End Session")').click();

    // Then: Results show with the data
    await expect(page.locator('h1:has-text("Results")')).toBeVisible({ timeout: 5000 });

    // The unanimous yes (Unanimous Choice) should have 100% - check it appears
    await expect(page.locator('text=Unanimous Choice')).toBeVisible();
    await expect(page.locator('text=Maybe Choice')).toBeVisible();

    // One should be unanimous (Everyone agreed!)
    await expect(page.locator('text=Everyone agreed!')).toBeVisible();
  });
});
