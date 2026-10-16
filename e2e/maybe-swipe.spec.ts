import { test, expect, type Page } from '@playwright/test';

async function voteByTitle(page: Page, votes: Record<string, 'yes' | 'no' | 'maybe'>) {
  for (let index = 0; index < Object.keys(votes).length; index++) {
    const title = await page.locator('h2').innerText();
    expect(votes[title], `Unexpected card: ${title}`).toBeDefined();
    if (votes[title] === 'maybe') await page.getByRole('button', { name: 'Maybe', exact: true }).click();
    else await page.getByTestId(`swipe-${votes[title]}`).click();
    // Wait for the exit animation so the next vote targets the next card.
    if (index < Object.keys(votes).length - 1) await expect(page.locator('h2')).not.toHaveText(title);
  }
}

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
    await page.getByRole('button', { name: /Start Swiping|Start voting/i }).click();
    await expect(page).toHaveURL(/\/session\/.*\/swipe/);

    await voteByTitle(page, { Pizza: 'yes', Tacos: 'maybe', Sushi: 'no' });

    // Then: User is redirected to results (waiting) page
    await expect(page).toHaveURL(/\/results\//, { timeout: 5000 });

    // When: Creator ends the session - click the button then confirm in modal
    await page.click('text=End Session & Show Results');
    // Handle confirmation modal
    await page.getByRole('dialog', { name: 'End Session?', exact: true }).getByRole('button', { name: 'End Session', exact: true }).click();

    // Then: Results page shows
    await expect(page.locator('h1:has-text("Results")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('section h3')).toHaveText(['Pizza', 'Tacos', 'Sushi']);
    const tacos = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Tacos', exact: true }) });
    await expect(tacos).toContainText('0 yes, 1 maybe / 1 total');
    await expect(tacos).toContainText('100%');
  });

  test('maybe votes are ranked below unanimous yes votes', async ({ page, browser }) => {
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
    await page.getByRole('button', { name: /Start Swiping|Start voting/i }).click();
    await voteByTitle(page, { 'Unanimous Choice': 'yes', 'Maybe Choice': 'yes' });
    await expect(page).toHaveURL(/\/results\//, { timeout: 5000 });

    // Participant joins and swipes: Yes on first, Maybe on second
    const participantPage = await browser.newPage({ baseURL: test.info().project.use.baseURL });
    await participantPage.goto(`/join/${inviteCode}`);
    await participantPage.fill('#name', 'Participant');
    await participantPage.getByRole('button', { name: /Start Swiping|Start voting/i }).click();

    await voteByTitle(participantPage, { 'Unanimous Choice': 'yes', 'Maybe Choice': 'maybe' });

    await expect(participantPage).toHaveURL(/\/results\//, { timeout: 5000 });

    // Host ends the session - click button then confirm in modal
    await page.click('text=End Session & Show Results');
    await page.getByRole('dialog', { name: 'End Session?', exact: true }).getByRole('button', { name: 'End Session', exact: true }).click();

    // Then: Results show with the data
    await expect(page.locator('h1:has-text("Results")')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('section h3')).toHaveText(['Unanimous Choice', 'Maybe Choice']);
    const unanimous = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Unanimous Choice', exact: true }) });
    const maybe = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Maybe Choice', exact: true }) });
    await expect(unanimous).toContainText('2 yes / 2 total');
    await expect(unanimous).toContainText('Everyone agreed!');
    await expect(maybe).toContainText('1 yes, 1 maybe / 2 total');
    await expect(maybe).toContainText('100%');
    await expect(maybe).not.toContainText('Everyone agreed!');
    await participantPage.close();
  });
});
