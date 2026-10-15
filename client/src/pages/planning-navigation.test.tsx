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
  vi.mocked(planningApi.getWeek).mockImplementation(async week => plan(week));
  vi.mocked(planningApi.staples).mockResolvedValue([]);
  vi.mocked(mealsApi.list).mockResolvedValue([{ id: 'recipe', title: 'Saved recipe', type: 'meal', description: null, pickCount: 0 }]);
});
describe('planning week navigation', () => {
  it('closes a dated picker and clears its date/search when the query week changes', async () => {
    show(); await screen.findByRole('heading', { name: 'Dinner a' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Leave open or add meal' })[0]);
    fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: 'old query' } });
    expect(screen.getByLabelText('Add meal on')).toHaveValue(first);
    fireEvent.click(screen.getByText('External next week')); await screen.findByRole('heading', { name: 'Dinner b' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Add meal$/ }));
    expect(screen.getByLabelText('Add meal on')).toHaveValue(''); expect(screen.getByLabelText('Search recipes')).toHaveValue('');
    await screen.findByRole('button', { name: 'Add Saved recipe' });
  });
  it('discards old repeat selections and sends only the newly reviewed week IDs', async () => {
    vi.mocked(planningApi.repeat).mockResolvedValue(plan('2026-10-26'));
    show(); await screen.findByRole('heading', { name: 'Dinner a' });
    fireEvent.click(screen.getByText('Repeat a week')); fireEvent.click(screen.getByRole('button', { name: 'Choose meals to repeat' }));
    expect(screen.getByLabelText('Target Monday')).toHaveValue(second);
    fireEvent.click(screen.getByText('External next week')); await screen.findByRole('heading', { name: 'Dinner b' });
    expect(screen.queryByLabelText('Target Monday')).toBeNull();
    fireEvent.click(screen.getByText('Repeat a week')); fireEvent.click(screen.getByRole('button', { name: 'Choose meals to repeat' }));
    expect(screen.getByRole('checkbox', { name: /Dinner b/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Repeat selected meals' }));
    await screen.findByRole('link', { name: 'View repeated week' });
    expect(planningApi.repeat).toHaveBeenCalledWith(second, '2026-10-26', ['b']);
  });
  it('does not let a pending old-week save replace the new week or its busy state', async () => {
    let finish!: (value: Plan) => void;
    vi.mocked(planningApi.addEntry).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    show(); await screen.findByRole('heading', { name: 'Dinner a' });
    fireEvent.change(screen.getByLabelText('What sounds good?'), { target: { value: 'Old pizza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add takeout night' }));
    expect(screen.getByRole('button', { name: /^Next$/ })).toBeDisabled();
    fireEvent.click(screen.getByText('External next week')); await screen.findByRole('heading', { name: 'Dinner b' });
    expect(screen.getByRole('button', { name: /^Next$/ })).toBeEnabled();
    await act(async () => finish(plan(first)));
    expect(screen.getByRole('heading', { name: 'Dinner b' })).toBeVisible(); expect(screen.queryByRole('heading', { name: 'Dinner a' })).toBeNull();
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
