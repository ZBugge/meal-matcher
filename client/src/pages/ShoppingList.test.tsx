import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ShoppingList } from './ShoppingList';
import { planningApi, type ShoppingItem, type WeekPlan } from '../api/planning';

vi.mock('../api/planning', () => ({ planningApi: { getWeek: vi.fn(), bulkItems: vi.fn(), addItem: vi.fn(), updateItem: vi.fn(), removeItem: vi.fn() } }));
const week = '2026-10-12';
const firstAmount = 'one generous handful, reserving a little for serving';
const secondAmount = 'another large handful, washed and drained thoroughly';
const item = (id: string, data: Partial<ShoppingItem> = {}): ShoppingItem => ({ id, entryId: `dinner-${id}`, sourceTitle: `Recipe ${id}`, amount: '2 cans', ingredient: 'Beans', state: 'needed', aisle: null, displayOrder: Number(id) || 0, ...data });
const initial: WeekPlan = { week, entries: [], shopping: [item('1', { amount: firstAmount }), item('2', { amount: secondAmount }), item('3', { ingredient: 'Milk', amount: '1 carton', state: 'have' }), item('4', { ingredient: 'Rice', amount: '1 bag', state: 'bought' })] };
function show() { render(<MemoryRouter initialEntries={[`/shopping?week=${week}`]}><ShoppingList /></MemoryRouter>); }
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  vi.mocked(planningApi.getWeek).mockResolvedValue(initial);
});
describe('compact shopping', () => {
  it('keeps compact rows and opens exact ordered contributions only on request', async () => {
    show(); await screen.findByRole('checkbox', { name: 'Purchased Beans' });
    expect(screen.getByText('2 recipe amounts')).toBeVisible();
    expect(screen.queryByLabelText('Status for Beans')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Details & edit Beans' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.tagName).toBe('DIALOG');
    expect(within(dialog).getByText(`${firstAmount} Beans`)).toBeVisible();
    expect(within(dialog).getByText(`${secondAmount} Beans`)).toBeVisible();
    const sources = within(dialog).getAllByText(/^Recipe [12]$/);
    expect(sources.map(source => source.textContent)).toEqual(['Recipe 1', 'Recipe 2']);
  });
  it('preserves exact amounts and a visible manual-copy fallback when clipboard access fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } });
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Copy list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy shopping list' }));
    const error = await screen.findByRole('alert'); expect(screen.getByRole('dialog')).toContainElement(error);
    const text = screen.getByLabelText('List to copy') as HTMLTextAreaElement;
    expect(text.value).toContain(firstAmount); expect(text.value).toContain(secondAmount);
    expect(text.value).toContain(`Recipe 1: ${firstAmount} Beans`);
    expect(text.value).not.toContain('Milk'); expect(text.value).not.toContain('Rice');
    expect(error).toHaveTextContent('Select and copy');
  });
  it('applies pantry selections as have, disables completed purchases during review, and cancels without writes', async () => {
    vi.mocked(planningApi.bulkItems).mockResolvedValue({ ...initial, shopping: initial.shopping.map(row => row.state === 'needed' ? { ...row, state: 'have' } : row) });
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Review pantry' }));
    fireEvent.click(screen.getByText(/^Completed/));
    expect(screen.getByRole('checkbox', { name: 'Purchased Rice' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Already have Milk' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Already have Beans' }));
    expect(planningApi.bulkItems).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel pantry review' }));
    expect(planningApi.bulkItems).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Review pantry' }));
    expect(screen.getByRole('checkbox', { name: 'Already have Beans' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Already have Beans' }));
    fireEvent.click(screen.getByRole('button', { name: 'Already have selected (2)' }));
    await screen.findByText('Pantry review applied.');
    expect(planningApi.bulkItems).toHaveBeenCalledWith(week, ['1', '2'], 'have');
    expect(screen.queryByRole('region', { name: 'Pantry review' })).toBeNull();
  });
  it('preserves extra-item fields on failure and reports the error inside the sheet', async () => {
    vi.mocked(planningApi.addItem).mockRejectedValue(new Error('Could not save extra'));
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Item'), { target: { value: 'Tea' } });
    fireEvent.change(screen.getByLabelText('Amount (optional)'), { target: { value: '2 boxes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add extra item' }));
    const error = await screen.findByRole('alert'); expect(screen.getByRole('dialog')).toContainElement(error);
    expect(screen.getByLabelText('Item')).toHaveValue('Tea'); expect(screen.getByLabelText('Amount (optional)')).toHaveValue('2 boxes');
    expect(planningApi.addItem).toHaveBeenCalledWith(week, { ingredient: 'Tea', amount: '2 boxes' });
  });
  it('edits only one contribution, preserves failed drafts, and keeps the sheet open after regrouping', async () => {
    vi.mocked(planningApi.updateItem).mockRejectedValueOnce(new Error('Not saved')).mockImplementationOnce(async (_week, id, data) => ({ ...initial, shopping: initial.shopping.map(row => row.id === id ? { ...row, ...data } : row) }));
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Details & edit Beans' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Beans' })[0]);
    fireEvent.change(screen.getByLabelText('Edit amount for Beans'), { target: { value: 'a revised free-text amount' } });
    fireEvent.change(screen.getByLabelText('Aisle for Beans'), { target: { value: 'Other' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    await screen.findByRole('alert'); expect(screen.getByLabelText('Edit amount for Beans')).toHaveValue('a revised free-text amount');
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
    await screen.findByText('Item saved.');
    expect(planningApi.updateItem).toHaveBeenLastCalledWith(week, '1', { ingredient: 'Beans', amount: 'a revised free-text amount', aisle: 'Other' });
    const dialog = screen.getByRole('dialog'); expect(within(dialog).getByText('a revised free-text amount Beans')).toBeVisible();
    expect(within(dialog).getByText(`${secondAmount} Beans`)).toBeVisible();
  });
  it('keeps selections and an actionable error on failed pantry application', async () => {
    vi.mocked(planningApi.bulkItems).mockRejectedValue(new Error('Pantry save failed'));
    show(); fireEvent.click(await screen.findByRole('button', { name: 'Review pantry' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Already have Beans' }));
    fireEvent.click(screen.getByRole('button', { name: 'Already have selected (2)' }));
    const error = await screen.findByRole('alert'); expect(screen.getByRole('region', { name: 'Apply pantry review' })).toContainElement(error);
    expect(screen.getByRole('checkbox', { name: 'Already have Beans' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Already have selected (2)' })).toBeEnabled();
  });
  it('reverts a failed optimistic purchase and disables competing mutations while saving', async () => {
    let fail!: (e: Error) => void;
    vi.mocked(planningApi.bulkItems).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    show(); const checkbox = await screen.findByRole('checkbox', { name: 'Purchased Beans' });
    fireEvent.click(checkbox); expect(checkbox).toBeChecked();
    expect(screen.getByRole('button', { name: 'Add item' })).toBeDisabled(); expect(screen.getByRole('button', { name: 'Details & edit Beans' })).toBeDisabled();
    await act(async () => fail(new Error('Purchase failed')));
    expect(checkbox).not.toBeChecked(); expect(await screen.findByRole('alert')).toHaveTextContent('Purchase failed');
  });
});
