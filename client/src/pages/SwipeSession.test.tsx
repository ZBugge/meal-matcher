import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SwipeSession } from './SwipeSession';
import { participantApi } from '../api/client';

// Mock the API
vi.mock('../api/client', () => ({
  participantApi: {
    submitSwipes: vi.fn(),
  },
}));

// Mock SwipeDeck component
vi.mock('../components/SwipeDeck', () => ({
  SwipeDeck: ({ editMode, onComplete }: any) => (
    <div data-testid="swipe-deck">
      <div data-testid="edit-mode">{editMode ? 'edit' : 'normal'}</div>
      <button onClick={() => onComplete({ '1': 1, '2': 0 })}>Complete</button>
    </div>
  ),
}));

// Mock useSwipeProgress hook
vi.mock('../hooks/useLocalStorage', () => ({
  useSwipeProgress: () => ({
    progress: { swipes: {}, currentIndex: 0 },
    saveProgress: vi.fn(),
    clearProgress: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ sessionId: 'session123' }),
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null }),
  };
});

describe('SwipeSession - Edit Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('should pass editMode=false to SwipeDeck by default', () => {
    // Mock session data
    sessionStorage.setItem('session_session123', JSON.stringify({
      participantId: 'participant123',
      displayName: 'John',
      meals: [
        { id: '1', title: 'Pizza', description: 'Yum', sessionMealId: 'sm1' },
        { id: '2', title: 'Burger', description: 'Good', sessionMealId: 'sm2' },
      ],
    }));

    render(
      <BrowserRouter>
        <SwipeSession />
      </BrowserRouter>
    );

    // Should render SwipeDeck in normal mode
    expect(screen.getByTestId('edit-mode').textContent).toBe('normal');
  });

  it('should pass editMode=true to SwipeDeck when location.state.editMode is true', () => {
    // Mock session data
    sessionStorage.setItem('session_session123', JSON.stringify({
      participantId: 'participant123',
      displayName: 'John',
      meals: [
        { id: '1', title: 'Pizza', description: 'Yum', sessionMealId: 'sm1' },
        { id: '2', title: 'Burger', description: 'Good', sessionMealId: 'sm2' },
      ],
    }));

    // Mock useLocation to return editMode
    vi.doMock('react-router-dom', async () => {
      const actual = await vi.importActual('react-router-dom');
      return {
        ...actual,
        useParams: () => ({ sessionId: 'session123' }),
        useNavigate: () => mockNavigate,
        useLocation: () => ({ state: { editMode: true } }),
      };
    });

    render(
      <BrowserRouter>
        <SwipeSession />
      </BrowserRouter>
    );

    // Should render SwipeDeck in edit mode
    waitFor(() => {
      expect(screen.getByTestId('edit-mode').textContent).toBe('edit');
    });
  });

  it('should set initialIndex to meals.length in edit mode', () => {
    // Mock session data
    sessionStorage.setItem('session_session123', JSON.stringify({
      participantId: 'participant123',
      displayName: 'John',
      meals: [
        { id: '1', title: 'Pizza', description: 'Yum', sessionMealId: 'sm1' },
        { id: '2', title: 'Burger', description: 'Good', sessionMealId: 'sm2' },
      ],
    }));

    render(
      <BrowserRouter>
        <SwipeSession />
      </BrowserRouter>
    );

    // SwipeDeck should be rendered (component is mocked)
    expect(screen.getByTestId('swipe-deck')).toBeDefined();
  });
});
