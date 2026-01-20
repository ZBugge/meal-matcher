import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Results } from './Results';
import { participantApi } from '../api/client';

// Mock the API
vi.mock('../api/client', () => ({
  participantApi: {
    getResults: vi.fn(),
    getSessionStatus: vi.fn(),
    closeSession: vi.fn(),
  },
  mealsApi: {
    create: vi.fn(),
  },
}));

// Mock useAuth
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    logout: vi.fn(),
  }),
}));

// Mock useParams
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ sessionId: 'session123' }),
    useNavigate: () => mockNavigate,
  };
});

describe('Results - Update Choices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('should show "Update Your Choices" button when session is waiting and user has session data', async () => {
    // Mock session data exists
    sessionStorage.setItem('session_session123', JSON.stringify({
      participantId: 'participant123',
      displayName: 'John',
      meals: [],
    }));

    // Mock waiting results
    (participantApi.getResults as any).mockResolvedValue({
      status: 'waiting',
      results: [],
    });

    (participantApi.getSessionStatus as any).mockResolvedValue({
      participants: [
        { id: 'participant123', displayName: 'John', submitted: true },
      ],
    });

    render(
      <BrowserRouter>
        <Results />
      </BrowserRouter>
    );

    // Wait for data to load
    await screen.findByText('Waiting for Votes');

    // Should show Update Your Choices button
    const updateButton = screen.getByText('Update Your Choices');
    expect(updateButton).toBeDefined();
  });

  it('should NOT show "Update Your Choices" button when session data is missing', async () => {
    // No session data in storage

    // Mock waiting results
    (participantApi.getResults as any).mockResolvedValue({
      status: 'waiting',
      results: [],
    });

    (participantApi.getSessionStatus as any).mockResolvedValue({
      participants: [
        { id: 'participant123', displayName: 'John', submitted: true },
      ],
    });

    render(
      <BrowserRouter>
        <Results />
      </BrowserRouter>
    );

    // Wait for data to load
    await screen.findByText('Waiting for Votes');

    // Should NOT show Update Your Choices button
    expect(screen.queryByText('Update Your Choices')).toBeNull();
  });

  it('should navigate to SwipeSession with editMode when Update Your Choices is clicked', async () => {
    // Mock session data exists
    sessionStorage.setItem('session_session123', JSON.stringify({
      participantId: 'participant123',
      displayName: 'John',
      meals: [],
    }));

    // Mock waiting results
    (participantApi.getResults as any).mockResolvedValue({
      status: 'waiting',
      results: [],
    });

    (participantApi.getSessionStatus as any).mockResolvedValue({
      participants: [
        { id: 'participant123', displayName: 'John', submitted: true },
      ],
    });

    render(
      <BrowserRouter>
        <Results />
      </BrowserRouter>
    );

    // Wait for data to load
    await screen.findByText('Waiting for Votes');

    // Click Update Your Choices button
    const updateButton = screen.getByText('Update Your Choices');
    fireEvent.click(updateButton);

    // Should navigate with editMode state
    expect(mockNavigate).toHaveBeenCalledWith('/session/session123/swipe', { state: { editMode: true } });
  });

  it('should NOT show "Update Your Choices" button when session is closed', async () => {
    // Mock session data exists
    sessionStorage.setItem('session_session123', JSON.stringify({
      participantId: 'participant123',
      displayName: 'John',
      meals: [],
    }));

    // Mock closed results
    (participantApi.getResults as any).mockResolvedValue({
      status: 'closed',
      results: [
        {
          mealId: '1',
          title: 'Pizza',
          description: 'Delicious',
          yesCount: 2,
          maybeCount: 0,
          totalVotes: 3,
          percentage: 67,
          isUnanimous: false,
        },
      ],
    });

    render(
      <BrowserRouter>
        <Results />
      </BrowserRouter>
    );

    // Wait for results to load
    await screen.findByText('Results');

    // Should NOT show Update Your Choices button (session is closed)
    expect(screen.queryByText('Update Your Choices')).toBeNull();
  });
});
