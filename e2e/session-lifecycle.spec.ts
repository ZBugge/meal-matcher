import { test, expect } from '@playwright/test';

test.describe('Session Lifecycle (#1)', () => {
  test('host can end session early and participants see ended message', async ({ page, context }) => {
    // Given: Host creates a quick session
    await page.goto('/');
    await page.fill('#name', 'Host');
    await page.fill('input[placeholder="Option 1"]', 'Pizza');
    await page.click('text=+ Add another option');
    await page.fill('input[placeholder="Option 2"]', 'Tacos');
    await page.click('text=Create Session');
    await expect(page).toHaveURL(/\/session\/.*\/share/);

    // Get the invite code
    const shareUrl = await page.locator('input[readonly]').inputValue();
    const inviteCode = shareUrl.split('/join/')[1];

    // Host starts swiping and finishes
    await page.click('text=Start Swiping');
    await page.locator('[data-testid="swipe-yes"]').click();
    await page.locator('[data-testid="swipe-yes"]').click();
    await expect(page).toHaveURL(/\/results\//, { timeout: 5000 });

    // When: Participant joins but hasn't finished swiping
    const participantPage = await context.newPage();
    await participantPage.goto(`/join/${inviteCode}`);
    await participantPage.fill('#name', 'Slow Participant');
    await participantPage.click('text=Start Swiping');

    // Participant is on swipe page
    await expect(participantPage).toHaveURL(/\/session\/.*\/swipe/);

    // Host ends the session while participant is still swiping
    await page.click('text=End Session & Show Results');

    // Then: Host sees final results
    await expect(page.locator('h1:has-text("Results")')).toBeVisible({ timeout: 5000 });

    // When: Participant tries to submit their vote
    await participantPage.locator('[data-testid="swipe-yes"]').click();
    await participantPage.locator('[data-testid="swipe-yes"]').click();

    // Then: Participant sees "Session Ended" message
    await expect(participantPage.locator('text=Session Ended')).toBeVisible({ timeout: 5000 });
    await expect(participantPage.locator('text=This session has been ended')).toBeVisible();

    // And: Participant can go home
    await expect(participantPage.locator('button:has-text("Go Home")')).toBeVisible();
  });

  test('host sees confirmation when ending session with unsubmitted participants', async ({ page, context }) => {
    // Given: Host creates a quick session
    await page.goto('/');
    await page.fill('#name', 'Host');
    await page.fill('input[placeholder="Option 1"]', 'Option A');
    await page.click('text=Create Session');
    await expect(page).toHaveURL(/\/session\/.*\/share/);

    // Get the invite code
    const shareUrl = await page.locator('input[readonly]').inputValue();
    const inviteCode = shareUrl.split('/join/')[1];

    // Host finishes swiping
    await page.click('text=Start Swiping');
    await page.locator('[data-testid="swipe-yes"]').click();
    await expect(page).toHaveURL(/\/results\//, { timeout: 5000 });

    // Participant joins but doesn't swipe
    const participantPage = await context.newPage();
    await participantPage.goto(`/join/${inviteCode}`);
    await participantPage.fill('#name', 'Waiting Participant');
    await participantPage.click('text=Start Swiping');

    // Wait for participant to show up in the session
    await page.waitForTimeout(1000);

    // When: Host tries to end session
    await page.click('text=End Session & Show Results');

    // Then: Confirmation modal appears warning about unfinished participants
    await expect(page.locator('text=End Session?')).toBeVisible();
    await expect(page.locator('text=/\\d+ (person hasn\'t|people haven\'t) finished voting/')).toBeVisible();

    // When: Host confirms by clicking the button inside the modal
    const modal = page.locator('.fixed.inset-0');
    await modal.locator('button:has-text("End Session")').click();

    // Then: Session ends and results are shown
    await expect(page.locator('h1:has-text("Results")')).toBeVisible({ timeout: 5000 });
  });

  test('waiting participant sees vote count update in real-time', async ({ page, context }) => {
    // Given: Host creates a session
    await page.goto('/');
    await page.fill('#name', 'Host');
    await page.fill('input[placeholder="Option 1"]', 'Meal A');
    await page.click('text=Create Session');
    await expect(page).toHaveURL(/\/session\/.*\/share/);

    const shareUrl = await page.locator('input[readonly]').inputValue();
    const inviteCode = shareUrl.split('/join/')[1];

    // Host finishes swiping and goes to results
    await page.click('text=Start Swiping');
    await page.locator('[data-testid="swipe-yes"]').click();
    await expect(page).toHaveURL(/\/results\//, { timeout: 5000 });

    // Participant 1 joins
    const participant1 = await context.newPage();
    await participant1.goto(`/join/${inviteCode}`);
    await participant1.fill('#name', 'Participant 1');
    await participant1.click('text=Start Swiping');
    await participant1.locator('[data-testid="swipe-yes"]').click();
    await expect(participant1).toHaveURL(/\/results\//, { timeout: 5000 });

    // Then: Host page shows participant count updating
    // "X of Y people have finished voting"
    await expect(page.locator('text=/\\d+ of \\d+ people have finished voting/')).toBeVisible();
  });

  test('participant can go home after session ends', async ({ page }) => {
    // Given: User is on home page
    await page.goto('/');

    // Create a session
    await page.fill('#name', 'Solo Host');
    await page.fill('input[placeholder="Option 1"]', 'Solo Meal');
    await page.click('text=Create Session');
    await expect(page).toHaveURL(/\/session\/.*\/share/);

    // Host swipes
    await page.click('text=Start Swiping');
    await page.locator('[data-testid="swipe-yes"]').click();
    await expect(page).toHaveURL(/\/results\//, { timeout: 5000 });

    // Host ends session
    await page.click('text=End Session & Show Results');

    // Then: Final results are shown
    await expect(page.locator('h1:has-text("Results")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Solo Meal')).toBeVisible();
  });
});
