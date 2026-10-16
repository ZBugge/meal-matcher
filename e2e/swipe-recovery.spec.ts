import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('a failed submission keeps choices and waits for an explicit retry', async ({ page }) => {
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.getByPlaceholder('Option 1').fill('Pizza');
  await page.getByRole('button', { name: 'Create Session', exact: true }).click();
  await page.getByRole('button', { name: /Start Swiping|Start voting/i }).click();
  let submissions = 0;
  await page.route('**/api/swipes/*', async route => {
    submissions++;
    if (submissions === 1) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Connection interrupted. Please retry.' }) });
    else await route.continue();
  });
  await page.getByTestId('swipe-yes').click();
  await expect(page.getByText('Connection interrupted. Please retry.')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry Submission' });
  await expect(retry).toBeVisible();
  await expect(page.getByText('YES', { exact: true })).toBeVisible();
  // Allow a second request/render cycle; there must be no automatic retry loop.
  await page.waitForTimeout(1000);
  expect(submissions).toBe(1);
  await retry.click();
  await expect(page).toHaveURL(/\/results\//);
  expect(submissions).toBe(2);
  const status = await page.request.get(`/api/session-status/${new URL(page.url()).pathname.split('/')[2]}`);
  expect(await status.json()).toMatchObject({ participants: [{ displayName: 'Alex', submitted: true }] });
});

async function voteRemaining(page: Page, votes: Record<string, 'yes' | 'no' | 'maybe'>, count: number) {
  for (let index = 0; index < count; index++) {
    const title = await page.locator('h2').innerText();
    const vote = votes[title];
    expect(vote, `Unexpected option ${title}`).toBeDefined();
    if (vote === 'maybe') await page.getByRole('button', { name: 'Maybe', exact: true }).click();
    else await page.getByTestId(`swipe-${vote}`).click();
    if (index < count - 1) await expect(page.locator('h2')).not.toHaveText(title);
  }
}

test('two phones preserve partial swipes, back navigation, and submitted choice edits', async ({ page, browser }) => {
  await page.goto('/');
  await page.locator('#name').fill('Alex');
  await page.getByPlaceholder('Option 1').fill('Pizza');
  await page.getByText('+ Add another option', { exact: true }).click();
  await page.getByPlaceholder('Option 2').fill('Tacos');
  await page.getByText('+ Add another option', { exact: true }).click();
  await page.getByPlaceholder('Option 3').fill('Sushi');
  await page.getByRole('button', { name: 'Create Session', exact: true }).click();
  await expect(page).toHaveURL(/\/session\/.*\/share/);
  const inviteUrl = await page.locator('input[readonly]').inputValue();
  const sessionId = new URL(page.url()).pathname.split('/')[2];

  const partner = await browser.newPage({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  try {
    await partner.goto(inviteUrl);
    await partner.locator('#name').fill('Sam');
    await partner.getByRole('button', { name: /Start Swiping|Start voting/i }).click();
    await expect(partner.getByText('1 / 3', { exact: true })).toBeVisible();
    const partnerVotes = { Pizza: 'yes', Tacos: 'maybe', Sushi: 'no' } as const;
    const firstTitle = await partner.locator('h2').innerText();
    await voteRemaining(partner, partnerVotes, 1);
    await expect(partner.getByText('2 / 3', { exact: true })).toBeVisible();
    await expect(partner.locator('h2')).not.toHaveText(firstTitle);
    const secondTitle = await partner.locator('h2').innerText();

    // Reload uses local progress plus the participant identity in session storage.
    await partner.reload();
    await expect(partner.getByText('2 / 3', { exact: true })).toBeVisible();
    await expect(partner.locator('h2')).toHaveText(secondTitle);
    await partner.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(partner.locator('h2')).toHaveText(firstTitle);
    await partner.reload();
    await expect(partner.locator('h2')).toHaveText(firstTitle);
    await expect(partner.getByText('1 / 3', { exact: true })).toBeVisible();
    await voteRemaining(partner, partnerVotes, 3);
    await expect(partner).toHaveURL(/\/results\//);
    await expect(partner.getByRole('button', { name: 'End Session & Show Results' })).toHaveCount(0);

    await page.getByRole('button', { name: /Start Swiping|Start voting/i }).click();
    await voteRemaining(page, { Pizza: 'yes', Tacos: 'yes', Sushi: 'no' }, 3);
    await expect(page).toHaveURL(/\/results\//);
    await expect(page.getByText('2 of 2 people have finished voting')).toBeVisible();
    await expect(page.getByText('Alex', { exact: true })).toBeVisible();
    await expect(page.getByText('Sam', { exact: true })).toBeVisible();

    await partner.getByRole('button', { name: 'Update Your Choices' }).click();
    await expect(partner.getByRole('button', { name: 'Pizza YES' })).toBeVisible();
    await expect(partner.getByRole('button', { name: 'Sushi NO' })).toBeVisible();
    await partner.getByRole('button', { name: 'Tacos MAYBE' }).click();
    await expect(partner.getByRole('button', { name: 'Tacos NO' })).toBeVisible();
    await partner.reload();
    await expect(partner.getByRole('button', { name: 'Pizza YES' })).toBeVisible();
    await expect(partner.getByRole('button', { name: 'Tacos NO' })).toBeVisible();
    await expect(partner.getByRole('button', { name: 'Sushi NO' })).toBeVisible();
    await partner.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(partner.getByText('3 / 3', { exact: true })).toBeVisible();
    const revisitedTitle = await partner.locator('h2').innerText();
    await partner.reload();
    await expect(partner.locator('h2')).toHaveText(revisitedTitle);
    await expect(partner.getByText('3 / 3', { exact: true })).toBeVisible();
    await voteRemaining(partner, { Pizza: 'yes', Tacos: 'no', Sushi: 'no' }, 1);
    await expect(partner.getByRole('heading', { name: 'Edit Your Choices' })).toBeVisible();
    await expect(partner.getByRole('button', { name: 'Tacos NO' })).toBeVisible();
    await partner.getByRole('button', { name: 'Submit Votes' }).click();
    await expect(partner).toHaveURL(/\/results\//);
    await partner.reload();
    await expect(partner.getByText('2 of 2 people have finished voting')).toBeVisible();

    await page.getByRole('button', { name: 'End Session & Show Results' }).click();
    await page.getByRole('dialog', { name: 'End Session?', exact: true }).getByRole('button', { name: 'End Session', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Results', exact: true })).toBeVisible();
    await partner.reload();
    await expect(partner.locator('section h3')).toHaveText(['Pizza', 'Tacos', 'Sushi']);
    for (const [title, counts, percentage] of [
      ['Pizza', '2 yes / 2 total', '100%'],
      ['Tacos', '1 yes / 2 total', '50%'],
      ['Sushi', '0 yes / 2 total', '0%'],
    ]) {
      const result = partner.locator('.card').filter({ has: partner.getByRole('heading', { name: title, exact: true }) });
      await expect(result).toContainText(counts);
      await expect(result).toContainText(percentage);
    }
    const status = await page.request.get(`/api/session-status/${sessionId}`);
    expect(await status.json()).toMatchObject({ status: 'closed', participants: [
      { displayName: 'Alex', submitted: true }, { displayName: 'Sam', submitted: true },
    ] });
    expect(await partner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await partner.close();
  }
});
