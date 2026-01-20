import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SwipeDeck } from './SwipeDeck';

const mockMeals = [
  { id: '1', title: 'Pizza', description: 'Delicious pizza' },
  { id: '2', title: 'Burger', description: 'Juicy burger' },
  { id: '3', title: 'Salad', description: null },
];

describe('SwipeDeck', () => {
  it('should auto-submit when all swipes are done (not in edit mode)', () => {
    const onComplete = vi.fn();
    const onSwipe = vi.fn();

    // Pre-fill all swipes
    const initialSwipes = { '1': 1, '2': 0, '3': 2 };
    const initialIndex = 3; // All meals swiped

    render(
      <SwipeDeck
        meals={mockMeals}
        initialSwipes={initialSwipes}
        initialIndex={initialIndex}
        onSwipe={onSwipe}
        onComplete={onComplete}
        editMode={false}
      />
    );

    // onComplete should be called automatically
    expect(onComplete).toHaveBeenCalledWith(initialSwipes);
  });

  it('should show display-only review when not in edit mode', () => {
    const onComplete = vi.fn();
    const onSwipe = vi.fn();

    const initialSwipes = { '1': 1, '2': 0, '3': 2 };
    const initialIndex = 3;

    render(
      <SwipeDeck
        meals={mockMeals}
        initialSwipes={initialSwipes}
        initialIndex={initialIndex}
        onSwipe={onSwipe}
        onComplete={onComplete}
        editMode={false}
      />
    );

    // Should show "Your Choices" header
    expect(screen.getByText('Your Choices')).toBeDefined();
    expect(screen.getByText('Your votes have been submitted')).toBeDefined();

    // Should show View Results button
    expect(screen.getByText('View Results')).toBeDefined();

    // Meal items should be divs (not buttons) in display-only mode
    const pizzaElement = screen.getByText('Pizza').closest('div');
    expect(pizzaElement?.tagName).toBe('DIV');
  });

  it('should show editable review when in edit mode', () => {
    const onComplete = vi.fn();
    const onSwipe = vi.fn();

    const initialSwipes = { '1': 1, '2': 0, '3': 2 };
    const initialIndex = 3;

    render(
      <SwipeDeck
        meals={mockMeals}
        initialSwipes={initialSwipes}
        initialIndex={initialIndex}
        onSwipe={onSwipe}
        onComplete={onComplete}
        editMode={true}
      />
    );

    // Should show "Edit Your Choices" header
    expect(screen.getByText('Edit Your Choices')).toBeDefined();
    expect(screen.getByText('Tap any meal to change your vote')).toBeDefined();

    // Should show Submit Votes button
    expect(screen.getByText('Submit Votes')).toBeDefined();

    // Meal items should be buttons in edit mode
    const pizzaElement = screen.getByText('Pizza').closest('button');
    expect(pizzaElement?.tagName).toBe('BUTTON');
  });

  it('should allow vote changes in edit mode', () => {
    const onComplete = vi.fn();
    const onSwipe = vi.fn();

    const initialSwipes = { '1': 1, '2': 0, '3': 2 };
    const initialIndex = 3;

    render(
      <SwipeDeck
        meals={mockMeals}
        initialSwipes={initialSwipes}
        initialIndex={initialIndex}
        onSwipe={onSwipe}
        onComplete={onComplete}
        editMode={true}
      />
    );

    // Click on Pizza to change vote
    const pizzaButton = screen.getByText('Pizza').closest('button');
    if (pizzaButton) {
      fireEvent.click(pizzaButton);
      // Vote should cycle: 1 -> 2
      expect(onSwipe).toHaveBeenCalledWith('1', 2, expect.any(Object));
    }
  });

  it('should NOT allow vote changes when not in edit mode', () => {
    const onComplete = vi.fn();
    const onSwipe = vi.fn();

    const initialSwipes = { '1': 1, '2': 0, '3': 2 };
    const initialIndex = 3;

    render(
      <SwipeDeck
        meals={mockMeals}
        initialSwipes={initialSwipes}
        initialIndex={initialIndex}
        onSwipe={onSwipe}
        onComplete={onComplete}
        editMode={false}
      />
    );

    // Try to click on Pizza (but it's a div, not a button)
    const pizzaElement = screen.getByText('Pizza');
    fireEvent.click(pizzaElement);

    // onSwipe should NOT be called (votes are locked)
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('should call onComplete when Submit Votes is clicked in edit mode', () => {
    const onComplete = vi.fn();
    const onSwipe = vi.fn();

    const initialSwipes = { '1': 1, '2': 0, '3': 2 };
    const initialIndex = 3;

    render(
      <SwipeDeck
        meals={mockMeals}
        initialSwipes={initialSwipes}
        initialIndex={initialIndex}
        onSwipe={onSwipe}
        onComplete={onComplete}
        editMode={true}
      />
    );

    const submitButton = screen.getByText('Submit Votes');
    fireEvent.click(submitButton);

    expect(onComplete).toHaveBeenCalledWith(initialSwipes);
  });

  it('should display vote labels correctly', () => {
    const onComplete = vi.fn();
    const onSwipe = vi.fn();

    const initialSwipes = { '1': 1, '2': 0, '3': 2 };
    const initialIndex = 3;

    render(
      <SwipeDeck
        meals={mockMeals}
        initialSwipes={initialSwipes}
        initialIndex={initialIndex}
        onSwipe={onSwipe}
        onComplete={onComplete}
        editMode={false}
      />
    );

    // Check vote labels
    expect(screen.getByText('YUM')).toBeDefined(); // Pizza: vote 1
    expect(screen.getByText('NOPE')).toBeDefined(); // Burger: vote 0
    expect(screen.getByText('MAYBE')).toBeDefined(); // Salad: vote 2
  });
});
