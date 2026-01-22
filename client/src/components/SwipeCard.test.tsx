import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SwipeCard } from './SwipeCard';

describe('SwipeCard', () => {
  const defaultProps = {
    title: 'Test Meal',
    description: 'Test Description',
    onSwipe: vi.fn(),
    progress: '1 / 5',
  };

  it('should render card with title and description', () => {
    render(<SwipeCard {...defaultProps} />);
    expect(screen.getByText('Test Meal')).toBeDefined();
    expect(screen.getByText('Test Description')).toBeDefined();
  });

  it('should render progress indicator', () => {
    render(<SwipeCard {...defaultProps} />);
    expect(screen.getByText('1 / 5')).toBeDefined();
  });

  it('should render without description when null', () => {
    render(<SwipeCard {...defaultProps} description={null} />);
    expect(screen.getByText('Test Meal')).toBeDefined();
    expect(screen.queryByText('Test Description')).toBeNull();
  });

  it('should render text hint when hintStyle is text', () => {
    render(<SwipeCard {...defaultProps} hintStyle="text" />);
    expect(screen.getByText('👆 Swipe to vote')).toBeDefined();
  });

  it('should not render text hint when hintStyle is bounce', () => {
    render(<SwipeCard {...defaultProps} hintStyle="bounce" />);
    expect(screen.queryByText('👆 Swipe to vote')).toBeNull();
  });

  it('should not render text hint when hintStyle is arrows', () => {
    render(<SwipeCard {...defaultProps} hintStyle="arrows" />);
    expect(screen.queryByText('👆 Swipe to vote')).toBeNull();
  });

  it('should render Nope and Yum indicators on the card', () => {
    render(<SwipeCard {...defaultProps} />);
    expect(screen.getByText('NOPE')).toBeDefined();
    expect(screen.getByText('YUM!')).toBeDefined();
  });

  it('should apply stronger shadow and border styles to card', () => {
    const { container } = render(<SwipeCard {...defaultProps} />);
    const card = container.querySelector('.shadow-2xl.border-2.border-gray-300');
    expect(card).toBeDefined();
  });

  it('should render smaller, more subtle buttons', () => {
    const { container } = render(<SwipeCard {...defaultProps} />);
    const buttons = container.querySelectorAll('.w-10.h-10.opacity-70');
    expect(buttons.length).toBe(2); // One for left, one for right
  });
});
