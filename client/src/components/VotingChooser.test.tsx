import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VotingChooser } from './VotingChooser';

const meals = [
  { id: 'pizza', title: 'Pizza', description: 'Tomato and basil' },
  { id: 'salad', title: 'Salad', description: null },
  { id: 'tacos', title: 'Tacos', description: 'Corn tortillas' },
];

describe('VotingChooser', () => {
  it('defaults to a list and submits an explicit all-No ballot', () => {
    const onComplete = vi.fn();
    const onProgressChange = vi.fn();
    render(<VotingChooser meals={meals} onComplete={onComplete} onProgressChange={onProgressChange} />);
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Votes' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({ pizza: 0, salad: 0, tacos: 0 });
    expect(onProgressChange).toHaveBeenCalledWith({ pizza: 0, salad: 0, tacos: 0 }, 0);
  });

  it('persists each toggle and normalizes missing votes on explicit submit', () => {
    const onComplete = vi.fn();
    const onProgressChange = vi.fn();
    render(<VotingChooser meals={meals} onComplete={onComplete} onProgressChange={onProgressChange} initialIndex={1} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pizza' }));
    expect(onProgressChange).toHaveBeenLastCalledWith({ pizza: 1 }, 1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Salad' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Salad' }));
    expect(screen.getByText('1 selected Yes')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Votes' }));
    expect(onComplete).toHaveBeenCalledWith({ pizza: 1, salad: 0, tacos: 0 });
  });

  it('preserves Maybe until the user explicitly changes or removes it', () => {
    const onComplete = vi.fn();
    render(<VotingChooser meals={meals} initialSwipes={{ pizza: 2, salad: 2 }} onComplete={onComplete} />);
    expect(screen.getByText('0 selected Yes · 2 Maybe')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Pizza' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Pizza' })).toHaveAccessibleDescription('Maybe');
    fireEvent.click(screen.getByLabelText('Details for Pizza'));
    expect(screen.getByText('Tomato and basil')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Votes' }));
    expect(onComplete).toHaveBeenLastCalledWith({ pizza: 2, salad: 2, tacos: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Maybe for Pizza' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Salad' }));
    expect(screen.queryByText('Maybe', { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Votes' }));
    expect(onComplete).toHaveBeenLastCalledWith({ pizza: 0, salad: 1, tacos: 0 });
  });

  it('shares votes and the actual Back cursor across view switches', async () => {
    const onProgressChange = vi.fn();
    const onModeChange = vi.fn();
    render(<VotingChooser meals={meals} initialSwipes={{ pizza: 1 }} initialIndex={1}
      onComplete={vi.fn()} onProgressChange={onProgressChange} onModeChange={onModeChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Swipe' }));
    await waitFor(() => expect(screen.getByText('2 / 3')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByText('1 / 3')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Salad' }));
    expect(onProgressChange).toHaveBeenLastCalledWith({ pizza: 1, salad: 1 }, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Swipe' }));
    await waitFor(() => expect(screen.getByText('1 / 3')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'Maybe' }));
    await waitFor(() => expect(screen.getByText('2 / 3')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByText('1 selected Yes · 1 Maybe')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Salad' })).toBeChecked();
    expect(onModeChange).toHaveBeenLastCalledWith('list');
  });

  it('retains list scroll and expanded description through a view switch', () => {
    render(<VotingChooser meals={meals} onComplete={vi.fn()} />);
    const list = screen.getByLabelText('Meal choices');
    const details = screen.getByLabelText('Details for Pizza');
    fireEvent.click(details);
    list.scrollTop = 120;
    fireEvent.scroll(list);
    fireEvent.click(screen.getByRole('button', { name: 'Swipe' }));
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(list.scrollTop).toBe(120);
    expect(details).toHaveAttribute('aria-expanded', 'true');
  });

  it('restores a completed Swipe cursor without implicit submission and retries explicitly', () => {
    const onComplete = vi.fn();
    const props = { meals, initialIndex: 3, initialSwipes: { pizza: 1, salad: 0, tacos: 2 }, initialMode: 'swipe' as const, onComplete };
    const { rerender } = render(<VotingChooser {...props} />);
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    fireEvent.click(screen.getByRole('button', { name: 'Swipe' }));
    expect(onComplete).not.toHaveBeenCalled();
    rerender(<VotingChooser {...props} canRetry />);
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Submission' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(props.initialSwipes);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry Submission' }));
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('keeps automatic completion for an actual final swipe without repeating after a mode switch', async () => {
    const onComplete = vi.fn();
    render(<VotingChooser meals={meals} initialMode="swipe" initialIndex={2}
      initialSwipes={{ pizza: 1, salad: 0 }} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Maybe' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith({ pizza: 1, salad: 0, tacos: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    fireEvent.click(screen.getByRole('button', { name: 'Swipe' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
