import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SwipeSession } from './SwipeSession';
import { participantApi } from '../api/client';

const routeParams = vi.hoisted(() => ({ sessionId: 'session123' }));
const locationState = vi.hoisted(() => ({ state: null as null | { editMode: boolean } }));

// Mock the API
vi.mock('../api/client', () => ({
  participantApi: {
    submitSwipes: vi.fn(),
  },
}));

// Mock SwipeDeck component
vi.mock('../components/SwipeDeck', () => ({
  SwipeDeck: ({ editMode, hintStyle, initialIndex, onComplete }: any) => (
    <div data-testid="swipe-deck">
      <div data-testid="edit-mode">{editMode ? 'edit' : 'normal'}</div>
      <div data-testid="hint-style">{hintStyle}</div>
      <div data-testid="initial-index">{initialIndex}</div>
      <button onClick={() => onComplete({ '1': 1, '2': 0 })}>Complete</button>
    </div>
  ),
}));

// Mock useSwipeProgress hook
vi.mock('../hooks/useLocalStorage', () => ({
  useSwipeProgress: () => ({
    progress: null,
    saveProgress: vi.fn(),
    clearProgress: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => routeParams,
    useNavigate: () => mockNavigate,
    useLocation: () => locationState,
  };
});

afterEach(() => { vi.useRealTimers(); });

describe('SwipeSession - Edit Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    locationState.state = null;
    routeParams.sessionId = 'session123';
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

    locationState.state = { editMode: true };

    render(
      <BrowserRouter>
        <SwipeSession />
      </BrowserRouter>
    );

    // Should render SwipeDeck in edit mode
    expect(screen.getByTestId('edit-mode').textContent).toBe('edit');
    expect(screen.getByText('Update your choices, John!')).toBeTruthy();
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

    locationState.state = { editMode: true };

    render(
      <BrowserRouter>
        <SwipeSession />
      </BrowserRouter>
    );

    expect(screen.getByTestId('initial-index').textContent).toBe('2');
  });
  it('stores accepted choices and cancels delayed navigation when unmounted', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem('session_session123', JSON.stringify({
      participantId: 'participant123', displayName: 'John', meals: [],
    }));
    vi.mocked(participantApi.submitSwipes).mockResolvedValue({ message: 'Saved' });
    const { unmount } = render(<BrowserRouter><SwipeSession /></BrowserRouter>);
    await act(async () => { fireEvent.click(screen.getByText('Complete')); });
    expect(JSON.parse(sessionStorage.getItem('session_session123')!).submittedSwipes).toEqual({ '1': 1, '2': 0 });
    expect(screen.getByText('Votes Submitted!')).toBeTruthy();
    unmount();
    act(() => vi.advanceTimersByTime(1500));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not retain another session context when the route changes', () => {
    sessionStorage.setItem('session_session123', JSON.stringify({
      participantId: 'participant123', displayName: 'John', meals: [],
    }));
    const { rerender } = render(<BrowserRouter><SwipeSession /></BrowserRouter>);
    expect(screen.getByTestId('swipe-deck')).toBeTruthy();
    routeParams.sessionId = 'different-session';
    rerender(<BrowserRouter><SwipeSession /></BrowserRouter>);
    expect(screen.queryByTestId('swipe-deck')).toBeNull();
    expect(screen.getByText('Session data not found. Please rejoin the session.')).toBeTruthy();
  });

});

describe('SwipeSession - Visual Improvements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    locationState.state = null;
    routeParams.sessionId = 'session123';
    // Setup session storage with mock data
    const mockSessionData = {
      participantId: 'test-participant',
      displayName: 'Test User',
      meals: [
        {
          id: 'meal-1',
          title: 'Pizza',
          description: 'Delicious pizza',
          sessionMealId: 'sm-1',
        },
      ],
    };
    sessionStorage.setItem('session_session123', JSON.stringify(mockSessionData));
  });

  it('should render with darker gradient background', () => {
    const { container } = render(
      <BrowserRouter>
        <SwipeSession />
      </BrowserRouter>
    );
    const background = container.querySelector('.bg-gradient-to-br.from-gray-200.to-gray-300');
    expect(background).not.toBeNull();
  });

  it('keeps the voting screen free of development hint switches', () => {
    render(<BrowserRouter><SwipeSession /></BrowserRouter>);
    expect(screen.queryByText(/Hint: /i)).toBeNull();
  });

  it('should display user greeting', () => {
    render(
      <BrowserRouter>
        <SwipeSession />
      </BrowserRouter>
    );
    expect(screen.getByText(/Hey Test User!/i)).toBeDefined();
  });


});
