import { test, expect } from '@playwright/test';

test.describe('Quick Session Flow', () => {
  test('creator can create session, swipe, and see Update Choices button', async ({ page }) => {
    // Given: User is on home page
    await page.goto('/');

    // When: User creates a quick session
    await page.fill('#name', 'Test Creator');
    await page.fill('input[placeholder="Option 1"]', 'Pizza');
    await page.click('text=+ Add another option');
    await page.fill('input[placeholder="Option 2"]', 'Tacos');
    await page.click('text=Create Session');

    // Then: User is taken to share page
    await expect(page).toHaveURL(/\/session\/.*\/share/);

    // When: User starts swiping
    await page.click('text=Start Swiping');

    // Then: User is on swipe page
    await expect(page).toHaveURL(/\/session\/.*\/swipe/);

    // When: User swipes through all meals (right swipe = yes)
    // First meal
    await page.locator('[data-testid="swipe-yes"]').click();
    // Second meal
    await page.locator('[data-testid="swipe-yes"]').click();

    // Then: User is redirected to results page
    await expect(page).toHaveURL(/\/results\//, { timeout: 5000 });

    // And: User sees "Update Your Choices" button while session is open
    await expect(page.locator('text=Update Your Choices')).toBeVisible();
  });

  test('participant can update choices while session is open', async ({ page, context }) => {
    // Given: A session has been created
    await page.goto('/');
    await page.fill('#name', 'Host');
    await page.fill('input[placeholder="Option 1"]', 'Sushi');
    await page.click('text=Create Session');
    await expect(page).toHaveURL(/\/session\/.*\/share/);

    // Get the invite URL
    const shareUrl = await page.locator('input[readonly]').inputValue();
    const inviteCode = shareUrl.split('/join/')[1];

    // When: A participant joins from the invite link
    const participantPage = await context.newPage();
    await participantPage.goto(`/join/${inviteCode}`);

    // And: Enters their name and starts swiping
    await participantPage.fill('#name', 'Participant');
    await participantPage.click('text=Start Swiping');

    // And: Swipes on the meal
    await participantPage.locator('[data-testid="swipe-yes"]').click();

    // Then: Participant sees results page with Update Choices button
    await expect(participantPage).toHaveURL(/\/results\//, { timeout: 5000 });
    await expect(participantPage.locator('text=Update Your Choices')).toBeVisible();

    // When: Participant clicks Update Choices
    await participantPage.click('text=Update Your Choices');

    // Then: Participant is taken back to swipe page in edit mode
    await expect(participantPage).toHaveURL(/\/session\/.*\/swipe/);
    await expect(participantPage.locator('text=Update your choices')).toBeVisible();
  });
});
