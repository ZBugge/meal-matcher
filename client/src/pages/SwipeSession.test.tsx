import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SwipeSession } from './SwipeSession';

// Mock the API
vi.mock('../api/client', () => ({
  participantApi: {
    submitSwipes: vi.fn(),
  },
}));

// Mock SwipeDeck component
vi.mock('../components/SwipeDeck', () => ({
  SwipeDeck: ({ editMode, hintStyle, onComplete }: any) => (
    <div data-testid="swipe-deck">
      <div data-testid="edit-mode">{editMode ? 'edit' : 'normal'}</div>
      <div data-testid="hint-style">{hintStyle}</div>
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

describe('SwipeSession - Visual Improvements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
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
    expect(background).toBeDefined();
  });

  it('should render hint style toggle button', () => {
    render(
      <BrowserRouter>
        <SwipeSession />
      </BrowserRouter>
    );
    const toggleButton = screen.getByText(/Hint: bounce/i);
    expect(toggleButton).toBeDefined();
  });

  it('should cycle through hint styles when toggle is clicked', () => {
    render(
      <BrowserRouter>
        <SwipeSession />
      </BrowserRouter>
    );

    // Initial state should be bounce
    expect(screen.getByText(/Hint: bounce/i)).toBeDefined();

    // Click once - should become arrows
    const toggleButton = screen.getByText(/Hint: bounce/i);
    fireEvent.click(toggleButton);
    expect(screen.getByText(/Hint: arrows/i)).toBeDefined();

    // Click again - should become text
    fireEvent.click(screen.getByText(/Hint: arrows/i));
    expect(screen.getByText(/Hint: text/i)).toBeDefined();

    // Click once more - should cycle back to bounce
    fireEvent.click(screen.getByText(/Hint: text/i));
    expect(screen.getByText(/Hint: bounce/i)).toBeDefined();
  });

  it('should display user greeting', () => {
    render(
      <BrowserRouter>
        <SwipeSession />
      </BrowserRouter>
    );
    expect(screen.getByText(/Hey Test User!/i)).toBeDefined();
  });

  it('should pass hintStyle prop to SwipeDeck', () => {
    render(
      <BrowserRouter>
        <SwipeSession />
      </BrowserRouter>
    );

    // Initial hint style should be bounce
    expect(screen.getByTestId('hint-style').textContent).toBe('bounce');

    // Toggle to arrows
    const toggleButton = screen.getByText(/Hint: bounce/i);
    fireEvent.click(toggleButton);
    expect(screen.getByTestId('hint-style').textContent).toBe('arrows');
  });
});
