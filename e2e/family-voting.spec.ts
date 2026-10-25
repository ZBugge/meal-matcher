import { randomUUID } from 'crypto';
import { test, expect } from '@playwright/test';

test('an authenticated quick-session choice can become a planned meal', async ({ page }) => {
  expect((await page.request.post('/api/auth/register', { data: { email: `quick-family-${randomUUID()}@test.local`, password: 'family-test-password' } })).status()).toBe(201);
  const quick = await (await page.request.post('/api/quick-session', { data: { creatorName: 'Family', mode: 'takeout', meals: [{ title: 'Thai night' }] } })).json();
  expect((await page.request.post(`/api/swipes/${quick.session.id}`, { data: { participantId: quick.participantId, swipes: quick.meals.map((meal: { id: string }) => ({ mealId: meal.id, vote: 1 })) } })).status()).toBe(200);
  await page.goto(`/session/${quick.session.id}`);
  await page.getByRole('button', { name: 'Close Session', exact: true }).click();
  await page.getByRole('button', { name: 'Add Thai night to this week', exact: true }).click();
  await page.getByRole('link', { name: 'Added · View week' }).click();
  await expect(page.getByRole('button', { name: 'Thai night Takeout night', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Thai night Takeout night', exact: true })).toBeVisible();
});

test('a family can search the library, collapse it, and plan several voted meals', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const register = await page.request.post('/api/auth/register', { data: { email: `family-${randomUUID()}@test.local`, password: 'family-test-password' } });
  expect(register.status()).toBe(201);
  for (const [title, ingredient] of [['Salmon bowls', 'salmon'], ['Asian tofu', 'tofu']]) {
    const response = await page.request.post('/api/meals', { data: { title, instructions: `Cook the ${ingredient} and serve with rice.`, ingredients: [{ amount: '2 portions', ingredient }] } });
    expect(response.status()).toBe(201);
  }
  expect((await page.request.post('/api/meals', { data: { title: 'Unchosen casserole' } })).status()).toBe(201);
  await page.goto('/');
  await expect(page).toHaveURL('/week');
  await test.info().attach('phone-week-home', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await expect(page.getByRole('heading', { name: 'Unchosen casserole' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Start a vote or view results' }).click();
  await expect(page.getByRole('navigation', { name: 'Family kitchen' })).toBeVisible();
  const create = page.getByRole('button', { name: 'Create Session', exact: true });
  expect((await create.boundingBox())!.y).toBeLessThan((await page.getByRole('heading', { name: 'My Meals', exact: true }).boundingBox())!.y);
  await expect(page.getByRole('button', { name: 'Show library' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Salmon bowls', exact: true })).toHaveCount(0);
  for (const name of ['Show library', 'Show history']) {
    const control = page.getByRole('button', { name, exact: true });
    await expect(control).toHaveAttribute('aria-expanded', 'false');
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await test.info().attach('phone-collapsed-library-and-history', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Show library' }).press('Space');
  await expect(page.getByRole('button', { name: 'Salmon bowls', exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('Salmon');
  await expect(page.getByRole('button', { name: 'Asian tofu', exact: true })).toHaveCount(0);
  await page.getByRole('searchbox').clear();
  await create.click();
  await page.getByRole('checkbox', { name: 'Unchosen casserole' }).uncheck();
  await page.getByRole('button', { name: 'Create (2 options)', exact: true }).click();
  await expect(page).toHaveURL(/\/session\//);
  const invite = await page.locator('input[readonly]').first().inputValue();
  const partner = await browser.newPage({ baseURL: test.info().project.use.baseURL });
  try {
    await partner.emulateMedia({ reducedMotion: 'reduce' });
    await partner.goto(invite);
    await partner.locator('#name').fill('Partner');
    await partner.getByRole('button', { name: /Start Swiping|Start voting/i }).click();
    await partner.getByRole('button', { name: 'Swipe', exact: true }).click();
    for (let index = 0; index < 2; index++) {
      await expect(partner.getByText('👆 Swipe to vote', { exact: true })).toBeVisible();
      await expect(partner.locator('[data-swipe-intro="true"]')).toHaveCount(0);
      const title = await partner.locator('h2').innerText();
      await partner.getByTestId('swipe-yes').click();
      if (index === 0) await expect(partner.locator('h2')).not.toHaveText(title);
    }
    await expect(partner).toHaveURL(/\/results\//);
    await expect(page.getByRole('navigation', { name: 'Family kitchen' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Close Session', exact: true }).click();
    await page.getByRole('button', { name: 'Add Salmon bowls to this week', exact: true }).click();
    await page.getByRole('button', { name: 'Add Asian tofu to this week', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Added · View week' })).toHaveCount(2);
    await partner.reload();
    await expect(partner.getByRole('button', { name: /Add .* to this week/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Added · View week' }).first().click();
    await expect(page.getByRole('heading', { name: 'Week plan', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Unchosen casserole' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Choose recipes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Salmon bowls Home cooking', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Asian tofu Home cooking', exact: true })).toBeVisible();
    const library = await (await page.request.get('/api/meals')).json();
    expect(library.every((meal: { pickCount: number }) => meal.pickCount === 0)).toBe(true);
  } finally { await partner.close(); }
});

// A vote belongs to the week the host was planning, even through quick/share/edit.
test('voted quick results keep a noncurrent planning week', async ({ page }) => {
  const week = '2030-01-07';
  expect((await page.request.post('/api/auth/register', { data: { email: `future-week-${randomUUID()}@test.local`, password: 'family-test-password' } })).status()).toBe(201);
  const today = new Date();
  today.setDate(today.getDate() - (today.getDay() + 6) % 7);
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await page.goto(`/week?week=${week}`);
  await page.getByRole('link', { name: 'Start a vote or view results' }).click();
  await page.getByRole('button', { name: 'Quick Session', exact: true }).click();
  await page.getByLabel('Your Name').fill('Future planner');
  await page.getByPlaceholder('Option 1').fill('Future Thai night');
  await page.getByRole('button', { name: 'Create Session', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/share\\?week=${week}$`));
  await page.getByRole('button', { name: /Start Swiping|Start voting|Continue to/i }).click();
    await page.getByRole('button', { name: 'Swipe', exact: true }).click();
  await page.getByTestId('swipe-yes').click();
  await expect(page).toHaveURL(new RegExp(`/results/[^?]+\\?week=${week}$`));
  await page.getByRole('button', { name: 'Update Your Choices', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Votes', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/results/[^?]+\\?week=${week}$`));
  const sessionId = new URL(page.url()).pathname.split('/').pop();
  await page.goto(`/dashboard${new URL(page.url()).search}`);
  await page.getByRole('button', { name: 'Show history', exact: true }).click();
  // The host session page must preserve the planning destination too.
  await page.locator('#session-history .card').first().click();
  await expect(page).toHaveURL(`/session/${sessionId}?week=${week}`);
  await expect(page.getByRole('link', { name: 'Join & Swipe', exact: true })).toHaveAttribute('href', new RegExp(`/join/[^?]+[?]week=${week}$`));
  await page.getByRole('button', { name: 'Close Session', exact: true }).click();
  await page.getByRole('button', { name: 'Add Future Thai night to this week', exact: true }).click();
  await page.getByRole('link', { name: 'Added · View week' }).click();
  await expect(page).toHaveURL(`/week?week=${week}`);
  await expect(page.getByRole('button', { name: 'Future Thai night Takeout night', exact: true })).toBeVisible();
  const currentPlan = await (await page.request.get(`/api/plans/${current}`)).json();
  expect(currentPlan.entries).toHaveLength(0);
});

test('a signed-in host can end voting from their results tab', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.request.post('/api/auth/register', { data: { email: `results-host-${randomUUID()}@test.local`, password: 'family-test-password' } })).status()).toBe(201);
  const meal = await (await page.request.post('/api/meals', { data: { title: 'Results soup' } })).json();
  const session = await (await page.request.post('/api/sessions', { data: { mealIds: [meal.id], mode: 'home' } })).json();
  const visitor = await browser.newContext();
  try {
    // Another participant has joined but has not voted.
    const guest = await visitor.newPage();
    await guest.goto(`/join/${session.inviteCode}`);
    await guest.locator('#name').fill('Still deciding');
    await guest.getByRole('button', { name: /Start Swiping|Start voting/i }).click();
    await guest.getByRole('button', { name: 'Swipe', exact: true }).click();
    await guest.goto(`/results/${session.id}`);
    await expect(guest.getByRole('heading', { name: 'Waiting for Votes' })).toBeVisible();
    await expect(guest.getByRole('button', { name: 'End Session & Show Results' })).toHaveCount(0);
    await page.goto(`/join/${session.inviteCode}?week=2030-01-07`);
    await page.locator('#name').fill('Host');
    await page.getByRole('button', { name: /Start Swiping|Start voting/i }).click();
    await page.getByRole('button', { name: 'Swipe', exact: true }).click();
    await page.getByTestId('swipe-yes').click();
    await expect(page).toHaveURL(`/results/${session.id}?week=2030-01-07`);
    await page.getByRole('button', { name: 'End Session & Show Results' }).click();
    await expect(page.getByText("1 person hasn't finished voting yet.")).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waiting for Votes' })).toBeVisible();
    await page.getByRole('button', { name: 'End Session & Show Results' }).click();
    await page.getByRole('button', { name: 'End Session', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Results', exact: true })).toBeVisible();
    await expect(page).toHaveURL(`/results/${session.id}?week=2030-01-07`);
    await expect(guest.getByRole('heading', { name: 'Results', exact: true })).toBeVisible();
    await test.info().attach('phone-host-results', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  } finally { await visitor.close(); }
});
