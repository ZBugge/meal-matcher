import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WeekPlan } from './WeekPlan';
import { planningApi, type WeekPlan as Plan } from '../api/planning';
import { mealsApi } from '../api/client';
import { currentWeekStart } from '../lib/week';

vi.mock('../api/planning', () => ({ planningApi: { getWeek: vi.fn(), staples: vi.fn(), addEntry: vi.fn(), updateEntry: vi.fn(), removeEntry: vi.fn(), repeat: vi.fn() } }));
vi.mock('../api/client', () => ({ mealsApi: { list: vi.fn() } }));
const week = '2026-10-12';
const initial: Plan = { week, entries: [{ id: 'one', mealId: 'recipe', kind: 'home', title: 'Bean stew', date: '2026-10-16' }, { id: 'two', mealId: null, kind: 'takeout', title: 'Pizza', date: '2026-10-16' }, { id: 'three', mealId: 'recipe', kind: 'home', title: 'Flexible soup', date: null }], shopping: [] };
function show(selected = week) { render(<MemoryRouter initialEntries={[`/week?week=${selected}`]}><WeekPlan /></MemoryRouter>); }
async function picker() { fireEvent.click(await screen.findByRole('button', { name: 'Add dinner' })); fireEvent.click(screen.getByRole('button', { name: 'Saved recipe' })); return screen.getByRole('dialog'); }
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  vi.mocked(planningApi.getWeek).mockResolvedValue(initial);
  vi.mocked(planningApi.staples).mockResolvedValue([]);
  vi.mocked(mealsApi.list).mockResolvedValue([{ id: 'recipe', title: 'Saved stew', type: 'meal', description: null, pickCount: 0 }]);
});
describe('compact week planning', () => {
  it('keeps every same-day dinner and flexible dinner independently reachable, with voting near the agenda', async () => {
    show();
    const agenda = await screen.findByRole('region', { name: 'Planned meals' });
    expect(within(agenda).getByRole('button', { name: /Bean stew/ })).toBeVisible();
    expect(within(agenda).getByRole('button', { name: /Pizza/ })).toBeVisible();
    expect(within(agenda).getByRole('button', { name: /Flexible soup/ })).toBeVisible();
    const choose = screen.getByRole('region', { name: 'Choose together' });
    expect(choose.compareDocumentPosition(agenda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(choose).getByRole('link')).toHaveAttribute('href', `/dashboard?week=${week}`);
  });
  it('shows Tonight only for the current week', async () => {
    show('2001-01-01'); await screen.findByRole('button', { name: 'Add dinner' });
    expect(screen.queryByRole('region', { name: 'Tonight' })).toBeNull();
  });
  it('shows Tonight on the current week', async () => {
    show(currentWeekStart()); expect(await screen.findByRole('region', { name: 'Tonight' })).toBeVisible();
  });
  it('loads recipes in a native dialog, distinguishes errors from empty results, and retries explicitly', async () => {
    let fail!: (e: Error) => void;
    vi.mocked(mealsApi.list).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    show(); const dialog = await picker();
    expect(dialog.tagName).toBe('DIALOG'); expect(within(dialog).getByRole('status')).toHaveTextContent('Loading saved recipes');
    await act(async () => fail(new Error('Recipes unavailable')));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Recipes unavailable');
    expect(within(dialog).queryByText(/Save recipes in/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry recipes' }));
    await within(dialog).findByRole('button', { name: 'Saved stew' });
    fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: 'nothing matches' } });
    expect(within(dialog).getByText('No recipes match. Try a different search.')).toBeVisible();
  });
  it('sends the explicit selected date when adding takeout', async () => {
    vi.mocked(planningApi.addEntry).mockResolvedValue(initial);
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Add dinner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Takeout night' }));
    fireEvent.change(screen.getByLabelText('What sounds good?'), { target: { value: 'Thai' } });
    fireEvent.change(screen.getByLabelText('Dinner on'), { target: { value: '2026-10-18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add takeout night' }));
    await screen.findByRole('status'); expect(planningApi.addEntry).toHaveBeenCalledWith(week, { kind: 'takeout', title: 'Thai', date: '2026-10-18' });
  });
  it('saves a dinner night explicitly, preserving its entry ID', async () => {
    vi.mocked(planningApi.updateEntry).mockResolvedValue(initial);
    show(); fireEvent.click((await screen.findAllByRole('button', { name: /Flexible soup Home cooking/ }))[0]);
    fireEvent.change(screen.getByLabelText('Night for Flexible soup'), { target: { value: '2026-10-15' } });
    expect(planningApi.updateEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save night' }));
    await screen.findByText('Dinner night saved.'); expect(planningApi.updateEntry).toHaveBeenCalledWith(week, 'three', { date: '2026-10-15' });
  });
  it('keeps the dinner dialog and scroll lock when removal is cancelled, then restores the initiating focus', async () => {
    show(); const opener = (await screen.findAllByRole('button', { name: /Flexible soup Home cooking/ }))[0];
    opener.focus(); fireEvent.click(opener);
    const remove = screen.getByRole('button', { name: 'Remove Flexible soup' }); remove.focus(); fireEvent.click(remove);
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel removal' }));
    expect(document.body.style.overflow).toBe('hidden'); expect(remove).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close Flexible soup' }));
    expect(opener).toHaveFocus(); expect(document.body.style.overflow).toBe('');
  });
  it('retains the selected grocery-removal choice and shows failures without closing confirmation', async () => {
    vi.mocked(planningApi.removeEntry).mockRejectedValueOnce(new Error('Save failed')).mockResolvedValue(initial);
    show(); fireEvent.click((await screen.findAllByRole('button', { name: /Flexible soup Home cooking/ }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Flexible soup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove dinner · keep groceries' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
    expect(planningApi.removeEntry).toHaveBeenLastCalledWith(week, 'three', true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove dinner and unpurchased groceries' }));
    await screen.findByText('Dinner and unpurchased groceries removed.');
    expect(planningApi.removeEntry).toHaveBeenLastCalledWith(week, 'three', false);
  });
});

