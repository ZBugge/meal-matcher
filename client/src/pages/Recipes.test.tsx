import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard';
import { mealsApi, sessionsApi, notionApi, type Meal } from '../api/client';

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'host', email: 'household@example.com' }, logout: vi.fn() }) }));
vi.mock('../api/client', () => ({ authApi: { updatePreferences: vi.fn() }, mealsApi: { parseRecipe: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), exportLibrary: vi.fn() }, sessionsApi: { list: vi.fn() }, notionApi: { status: vi.fn(), connect: vi.fn(), refresh: vi.fn(), disconnect: vi.fn() } }));
const meal: Meal = { id: 'recipe', title: 'Bean stew', description: 'Our favorite', type: 'meal', pickCount: 0, ingredients: [{ amount: 'one generous handful', ingredient: 'Beans' }], instructions: 'Simmer gently.', notes: 'Private family notes' };
function show() { render(<MemoryRouter initialEntries={['/recipes?week=2026-10-19']}><Dashboard /></MemoryRouter>); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(mealsApi.list).mockImplementation(async type => type === 'meal' ? [meal] : []);
  vi.mocked(sessionsApi.list).mockResolvedValue([]);
  vi.mocked(notionApi.status).mockResolvedValue({ connected: true, sourceUrl: 'https://www.notion.so/123', lastRefreshedAt: '2026-10-19T16:00:00Z', lastError: null, recipeCount: 1 });
});
describe('dedicated Recipes destination', () => {
  it('separates Notion and regular recipes, offers Notion editing and retains accepted copies after a failed refresh', async () => {
    const linked: Meal = { ...meal, id: 'notion', title: 'Notion soup', source: 'notion', notionUrl: 'https://www.notion.so/456' };
    vi.mocked(mealsApi.list).mockImplementation(async type => type === 'meal' ? [meal, linked] : []);
    vi.mocked(notionApi.refresh).mockRejectedValue(new Error('Notion is unavailable.'));
    show(); await screen.findByRole('button', { name: /Bean stew/ });
    expect(screen.queryByRole('button', { name: /Notion soup/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Notion recipes' }));
    expect(await screen.findByRole('button', { name: /Notion soup/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Bean stew/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add recipe' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Notion is unavailable.');
    fireEvent.click(screen.getByRole('button', { name: /Notion soup/ }));
    expect(screen.getByRole('link', { name: 'Edit in Notion' })).toHaveAttribute('href', linked.notionUrl);
    expect(screen.queryByRole('button', { name: 'Edit recipe' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete recipe' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Private notes' })).toBeNull();
  });
  it('opens to searchable saved recipes and keeps management out of the list', async () => {
    show(); expect(await screen.findByRole('button', { name: /Bean stew/ })).toBeVisible();
    expect(screen.getByLabelText('Search your recipes')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add recipe' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show library' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create Session' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Search your recipes'), { target: { value: 'no match' } });
    expect(screen.getByText('No matching options. Try another search.')).toBeVisible();
  });
  it('opens recipe actions and nested reading with exact private content and focus restoration', async () => {
    show(); const opener = await screen.findByRole('button', { name: /Bean stew/ }); opener.focus(); fireEvent.click(opener);
    const read = screen.getByRole('button', { name: 'Read recipe' }); read.focus(); fireEvent.click(read);
    const dialogs = screen.getAllByRole('dialog'); expect(dialogs).toHaveLength(2);
    expect(within(dialogs[1]).getByText('one generous handful')).toBeVisible();
    expect(within(dialogs[1]).getByText('Private family notes')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close recipe' }));
    expect(read).toHaveFocus(); expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Close Bean stew' }));
    expect(opener).toHaveFocus(); expect(document.body.style.overflow).toBe('');
  });
  it('retains failed recipe drafts and blocks duplicate saves', async () => {
    let fail!: (e: Error) => void;
    vi.mocked(mealsApi.create).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Add recipe' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New favorite' } });
    const submit = screen.getByRole('button', { name: 'Add Meal' });
    fireEvent.click(submit); fireEvent.click(submit); expect(mealsApi.create).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    await act(async () => fail(new Error('Recipe not saved')));
    const error = screen.getByRole('alert'); expect(screen.getByRole('dialog')).toContainElement(error);
    expect(screen.getByLabelText('Title')).toHaveValue('New favorite'); expect(submit).toBeEnabled();
  });
  it('keeps deletion failures inside the top confirmation', async () => {
    vi.mocked(mealsApi.delete).mockRejectedValue(new Error('Delete failed'));
    show(); fireEvent.click(await screen.findByRole('button', { name: /Bean stew/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete recipe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    const error = await screen.findByRole('alert'); const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(2); expect(dialogs[1]).toContainElement(error);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });
  it('offers import, export and selective deletion inside Manage library', async () => {
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Manage library' }));
    const dialog = screen.getByRole('dialog'); expect(within(dialog).getByRole('button', { name: 'Export' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Import' })).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Select options to delete' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Select Bean stew for deletion' })).toBeVisible();
  });
});

describe('recipe time and effort', () => {
  it('combines time, exact effort, and search while retaining unknown recipes until filtered', async () => {
    vi.mocked(mealsApi.list).mockImplementation(async type => type === 'meal' ? [
      {...meal, id: 'quick', title: 'Quick bean soup', totalMinutes: 15, effort: 'easy'},
      {...meal, id: 'slow', title: 'Slow bean stew', totalMinutes: 60, effort: 'easy'},
      {...meal, id: 'medium', title: 'Quick pasta', totalMinutes: 15, effort: 'medium'},
      {...meal, id: 'unknown', title: 'Mystery dinner'},
    ] : []);
    show(); await screen.findByRole('button', {name: /Mystery dinner/});
    fireEvent.change(screen.getByLabelText('Maximum total time'), {target: {value: '15'}});
    expect(screen.queryByRole('button', {name: /Slow bean stew/})).toBeNull();
    expect(screen.queryByRole('button', {name: /Mystery dinner/})).toBeNull();
    expect(screen.getByRole('button', {name: /Quick pasta/})).toBeVisible();
    fireEvent.change(screen.getByLabelText('Filter by effort'), {target: {value: 'easy'}});
    expect(screen.queryByRole('button', {name: /Quick pasta/})).toBeNull();
    fireEvent.change(screen.getByLabelText('Search your recipes'), {target: {value: 'pasta'}});
    expect(screen.queryByRole('button', {name: /Quick bean soup/})).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Clear filters'}));
    expect(screen.getByRole('button', {name: /Mystery dinner/})).toBeVisible();
    expect(screen.getByLabelText('Search your recipes')).toHaveValue('');
  });
  it('retains known values during unrelated edits and supports explicit clearing', async () => {
    vi.mocked(mealsApi.list).mockImplementation(async type => type === 'meal' ? [{...meal, totalMinutes: 30, effort: 'medium'}] : []);
    vi.mocked(mealsApi.update).mockResolvedValue({...meal, totalMinutes: 30, effort: 'medium'});
    show(); fireEvent.click(await screen.findByRole('button', {name: /Bean stew/}));
    fireEvent.click(screen.getByRole('button', {name: 'Edit recipe'}));
    expect(screen.getByLabelText('Total time (minutes)')).toHaveValue(30);
    expect(screen.getByLabelText('Effort')).toHaveValue('medium');
    fireEvent.change(screen.getByLabelText('Title'), {target: {value: 'Updated stew'}});
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));
    await screen.findByRole('button', {name: /Bean stew/});
    expect(mealsApi.update).toHaveBeenLastCalledWith('recipe', expect.objectContaining({title: 'Updated stew', totalMinutes: 30, effort: 'medium'}));
    fireEvent.click(screen.getByRole('button', {name: /Bean stew/}));
    fireEvent.click(screen.getByRole('button', {name: 'Edit recipe'}));
    fireEvent.change(screen.getByLabelText('Total time (minutes)'), {target: {value: ''}});
    fireEvent.change(screen.getByLabelText('Effort'), {target: {value: ''}});
    fireEvent.click(screen.getByRole('button', {name: 'Save'}));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mealsApi.update).toHaveBeenLastCalledWith('recipe', expect.objectContaining({totalMinutes: null, effort: null}));
  });
});

it('keeps home time and effort filters out of takeout results and category forms', async () => {
  vi.mocked(mealsApi.list).mockImplementation(async type => type === 'meal' ? [meal] : [{id: 'category', title: 'Thai', description: null, type: 'category', pickCount: 0}]);
  show(); await screen.findByRole('button', {name: /Bean stew/});
  fireEvent.change(screen.getByLabelText('Maximum total time'), {target: {value: '15'}});
  fireEvent.change(screen.getByLabelText('Filter by effort'), {target: {value: 'involved'}});
  fireEvent.click(screen.getByRole('button', {name: 'Takeout'}));
  expect(screen.getByRole('button', {name: /Thai/})).toBeVisible();
  expect(screen.queryByLabelText('Maximum total time')).toBeNull();
  fireEvent.click(screen.getByRole('button', {name: 'Add Category'}));
  expect(screen.queryByLabelText('Total time (minutes)')).toBeNull();
  expect(screen.queryByLabelText('Effort')).toBeNull();
});

it('keeps time and effort drafts when a pasted recipe fills other fields', async () => {
  vi.mocked(mealsApi.parseRecipe).mockResolvedValue({title: 'Pasted soup', description: null, instructions: 'Simmer.', ingredients: []});
  vi.mocked(mealsApi.create).mockResolvedValue({...meal, id: 'pasted', title: 'Pasted soup', totalMinutes: 20, effort: 'easy'});
  show(); fireEvent.click(await screen.findByRole('button', {name: 'Add recipe'}));
  fireEvent.change(screen.getByLabelText('Total time (minutes)'), {target: {value: '20'}});
  fireEvent.change(screen.getByLabelText('Effort'), {target: {value: 'easy'}});
  fireEvent.click(screen.getByRole('button', {name: 'Paste a full recipe'}));
  fireEvent.change(screen.getByLabelText('Recipe text to parse'), {target: {value: 'Title: Pasted soup'}});
  fireEvent.click(screen.getByRole('button', {name: 'Fill recipe form'}));
  await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Pasted soup'));
  expect(screen.getByLabelText('Total time (minutes)')).toHaveValue(20);
  expect(screen.getByLabelText('Effort')).toHaveValue('easy');
  fireEvent.click(screen.getByRole('button', {name: 'Add Meal'}));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(mealsApi.create).toHaveBeenCalledWith('Pasted soup', undefined, 'meal', expect.objectContaining({totalMinutes: 20, effort: 'easy'}));
});
