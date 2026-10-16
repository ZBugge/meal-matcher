import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard';
import { mealsApi, sessionsApi, type Meal } from '../api/client';

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'host', email: 'household@example.com' }, logout: vi.fn() }) }));
vi.mock('../api/client', () => ({ authApi: { updatePreferences: vi.fn() }, mealsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), exportLibrary: vi.fn() }, sessionsApi: { list: vi.fn() } }));
const meal: Meal = { id: 'recipe', title: 'Bean stew', description: 'Our favorite', type: 'meal', pickCount: 0, ingredients: [{ amount: 'one generous handful', ingredient: 'Beans' }], instructions: 'Simmer gently.', notes: 'Private family notes' };
function show() { render(<MemoryRouter initialEntries={['/recipes?week=2026-10-19']}><Dashboard /></MemoryRouter>); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(mealsApi.list).mockImplementation(async type => type === 'meal' ? [meal] : []);
  vi.mocked(sessionsApi.list).mockResolvedValue([]);
});
describe('dedicated Recipes destination', () => {
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
