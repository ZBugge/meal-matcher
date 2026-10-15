import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { AddToWeek } from './AddToWeek';
import { planningApi } from '../api/planning';

vi.mock('../api/planning', () => ({ planningApi: { addEntry: vi.fn() } }));

function Targets() {
  const navigate = useNavigate();
  const [mealId, setMealId] = useState('soup');
  return <>
    <button onClick={() => navigate('/dashboard?week=2026-10-19')}>Next target week</button>
    <button onClick={() => navigate('/dashboard?week=2026-10-26')}>Another target week</button>
    <button onClick={() => setMealId('pasta')}>Change recipe</button>
    <AddToWeek mealId={mealId} title={mealId} />
  </>;
}

describe('AddToWeek target identity', () => {
  it('isolates pending responses and resets added state when week or recipe changes', async () => {
    let rejectOld!: (reason: Error) => void;
    let resolveNew!: (value: never) => void;
    vi.mocked(planningApi.addEntry)
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }))
      .mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve; }));
    render(<MemoryRouter initialEntries={['/dashboard?week=2026-10-12']}><Targets /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Add soup to this week' }));
    expect(screen.getByRole('button', { name: 'Add soup to this week' })).toBeDisabled();
    fireEvent.click(screen.getByText('Next target week'));
    expect(screen.getByRole('button', { name: 'Add soup to this week' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add soup to this week' }));
    await act(async () => rejectOld(new Error('Old target failed')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add soup to this week' })).toBeDisabled();
    await act(async () => resolveNew({} as never));
    expect(screen.getByRole('link', { name: 'Added · View week' })).toHaveAttribute('href', '/week?week=2026-10-19');
    fireEvent.click(screen.getByText('Another target week'));
    expect(screen.getByRole('button', { name: 'Add soup to this week' })).toBeEnabled();
    fireEvent.click(screen.getByText('Change recipe'));
    expect(screen.getByRole('button', { name: 'Add pasta to this week' })).toBeEnabled();
    expect(planningApi.addEntry).toHaveBeenNthCalledWith(1, '2026-10-12', { mealId: 'soup' });
    expect(planningApi.addEntry).toHaveBeenNthCalledWith(2, '2026-10-19', { mealId: 'soup' });
  });
});
