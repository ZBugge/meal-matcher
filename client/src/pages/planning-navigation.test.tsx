import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { WeekPlan } from './WeekPlan';
import { ShoppingList } from './ShoppingList';
import { planningApi, type WeekPlan as Plan } from '../api/planning';
import { mealsApi } from '../api/client';

vi.mock('../api/planning', () => ({ planningApi: { getWeek: vi.fn(), staples: vi.fn(), addEntry: vi.fn(), repeat: vi.fn(), bulkItems: vi.fn() } }));
vi.mock('../api/client', () => ({ mealsApi: { list: vi.fn() } }));
const first = '2026-10-12'; const second = '2026-10-19';
function plan(week: string): Plan {
  const id = week === first ? 'a' : 'b';
  return { week, entries: [{ id, mealId: 'recipe', kind: 'home', title: `Dinner ${id}`, date: null }], shopping: [{ id: `item-${id}`, entryId: id, sourceTitle: `Dinner ${id}`, amount: '2 cans', ingredient: id === 'a' ? 'Beans' : 'Tomatoes', state: 'needed', aisle: null, displayOrder: 0 }] };
}
function Navigation({ shopping = false }: { shopping?: boolean }) {
  const navigate = useNavigate();
  return <><button onClick={() => navigate(`/${shopping ? 'shopping' : 'week'}?week=${second}`)}>External next week</button>{shopping ? <ShoppingList /> : <WeekPlan />}</>;
}
function show(shopping = false) { render(<MemoryRouter initialEntries={[`/${shopping ? 'shopping' : 'week'}?week=${first}`]}><Navigation shopping={shopping} /></MemoryRouter>); }

beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.mocked(planningApi.getWeek).mockImplementation(async week => plan(week));
  vi.mocked(planningApi.staples).mockResolvedValue([]);
  vi.mocked(mealsApi.list).mockResolvedValue([{ id: 'recipe', title: 'Saved recipe', type: 'meal', description: null, pickCount: 0 }]);
});
describe('planning week navigation', () => {
  it('closes a dated picker and clears its date/search when the query week changes', async () => {
    show(); await screen.findByRole('button', { name: 'Dinner a Home cooking' });
    fireEvent.click(screen.getAllByRole('button', { name: /Open night/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Saved recipe' }));
    fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: 'old query' } });
    expect(screen.getByLabelText('Add meal on')).toHaveValue(first);
    fireEvent.click(screen.getByText('External next week')); await screen.findByRole('button', { name: 'Dinner b Home cooking' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add dinner' })); fireEvent.click(screen.getByRole('button', { name: 'Saved recipe' }));
    expect(screen.getByLabelText('Add meal on')).toHaveValue(''); expect(screen.getByLabelText('Search recipes')).toHaveValue('');
    await screen.findByRole('button', { name: 'Saved recipe' });
  });
  it('discards old repeat selections and sends only the newly reviewed week IDs', async () => {
    vi.mocked(planningApi.repeat).mockResolvedValue(plan('2026-10-26'));
    show(); await screen.findByRole('button', { name: 'Dinner a Home cooking' });
    fireEvent.click(screen.getByRole('button', { name: 'Week tools' })); fireEvent.click(screen.getByRole('button', { name: 'Repeat a week' }));
    expect(screen.getByLabelText('Target Monday')).toHaveValue(second);
    fireEvent.click(screen.getByText('External next week')); await screen.findByRole('button', { name: 'Dinner b Home cooking' });
    expect(screen.queryByLabelText('Target Monday')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Week tools' })); fireEvent.click(screen.getByRole('button', { name: 'Repeat a week' }));
    expect(screen.getByRole('checkbox', { name: /Dinner b/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Repeat selected meals' }));
    await screen.findByRole('link', { name: 'View repeated week' });
    expect(planningApi.repeat).toHaveBeenCalledWith(second, '2026-10-26', ['b']);
  });
  it('does not let a pending old-week save replace the new week or its busy state', async () => {
    let finish!: (value: Plan) => void;
    vi.mocked(planningApi.addEntry).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    show(); await screen.findByRole('button', { name: 'Dinner a Home cooking' });
    fireEvent.click(screen.getByRole('button', { name: 'Add dinner' })); fireEvent.click(screen.getByRole('button', { name: 'Takeout night' }));
    fireEvent.change(screen.getByLabelText('What sounds good?'), { target: { value: 'Old pizza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add takeout night' }));
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled();
    fireEvent.click(screen.getByText('External next week')); await screen.findByRole('button', { name: 'Dinner b Home cooking' });
    expect(screen.getByRole('button', { name: 'Next week' })).toBeEnabled();
    await act(async () => finish(plan(first)));
    expect(screen.getByRole('button', { name: 'Dinner b Home cooking' })).toBeVisible(); expect(screen.queryByRole('button', { name: 'Dinner a Home cooking' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add dinner' })); fireEvent.click(screen.getByRole('button', { name: 'Takeout night' }));
    expect(screen.getByLabelText('What sounds good?')).toHaveValue('');
  });
  it('resets pantry selections on week navigation and isolates an old bulk failure', async () => {
    let fail!: (error: Error) => void;
    vi.mocked(planningApi.bulkItems).mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
    show(true); await screen.findByRole('checkbox', { name: 'Purchased Beans' });
    fireEvent.click(screen.getByRole('button', { name: 'Review pantry' })); fireEvent.click(screen.getByRole('checkbox', { name: 'Already have Beans' }));
    fireEvent.click(screen.getByRole('button', { name: 'Already have selected (1)' }));
    fireEvent.click(screen.getByText('External next week')); await screen.findByRole('checkbox', { name: 'Purchased Tomatoes' });
    expect(screen.getByRole('button', { name: 'Review pantry' })).toBeEnabled();
    await act(async () => fail(new Error('Old bulk save failed')));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review pantry' })); expect(screen.getByRole('button', { name: 'Already have selected (0)' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Already have Tomatoes' })).not.toBeChecked();
  });
});
