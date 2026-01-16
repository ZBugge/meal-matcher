import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import QuickSession from './QuickSession';
import * as client from '../api/client';

// Mock the API client
vi.mock('../api/client', () => ({
  quickSessionApi: {
    create: vi.fn()
  }
}));

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('QuickSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  const renderQuickSession = () => {
    return render(
      <BrowserRouter>
        <QuickSession />
      </BrowserRouter>
    );
  };

  it('should render the quick session form', () => {
    renderQuickSession();

    expect(screen.getByText('MealMatch')).toBeInTheDocument();
    expect(screen.getByLabelText('Your Name')).toBeInTheDocument();
    expect(screen.getByText('Meal Options')).toBeInTheDocument();
    expect(screen.getByText('Create Session')).toBeInTheDocument();
  });

  it('should start with one meal input', () => {
    renderQuickSession();

    const inputs = screen.getAllByPlaceholderText(/Option \d+/);
    expect(inputs).toHaveLength(1);
  });

  it('should add meal inputs when clicking add button', () => {
    renderQuickSession();

    const addButton = screen.getByText('+ Add another option');
    fireEvent.click(addButton);

    const inputs = screen.getAllByPlaceholderText(/Option \d+/);
    expect(inputs).toHaveLength(2);
  });

  it('should remove meal inputs when clicking remove button', () => {
    renderQuickSession();

    // Add a second meal
    const addButton = screen.getByText('+ Add another option');
    fireEvent.click(addButton);

    // Remove it
    const removeButtons = screen.getAllByLabelText('Remove meal');
    fireEvent.click(removeButtons[0]);

    const inputs = screen.getAllByPlaceholderText(/Option \d+/);
    expect(inputs).toHaveLength(1);
  });

  it('should not allow removing the last meal input', () => {
    renderQuickSession();

    const removeButtons = screen.queryAllByLabelText('Remove meal');
    expect(removeButtons).toHaveLength(0);
  });

  it('should show error if name is empty', async () => {
    renderQuickSession();

    const createButton = screen.getByText('Create Session');
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByText('Please enter your name')).toBeInTheDocument();
    });
  });

  it('should show error if no meal options are provided', async () => {
    renderQuickSession();

    const nameInput = screen.getByLabelText('Your Name');
    fireEvent.change(nameInput, { target: { value: 'Test User' } });

    const createButton = screen.getByText('Create Session');
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByText('Please add at least one meal option')).toBeInTheDocument();
    });
  });

  it('should create session and navigate on success', async () => {
    const mockResponse = {
      session: {
        id: 'session-123',
        inviteCode: 'ABC123',
        status: 'open'
      },
      participantId: 'participant-123',
      creatorToken: 'token-123',
      mealIds: ['meal-1', 'meal-2']
    };

    vi.mocked(client.quickSessionApi.create).mockResolvedValue(mockResponse);

    renderQuickSession();

    // Fill in form
    const nameInput = screen.getByLabelText('Your Name');
    fireEvent.change(nameInput, { target: { value: 'Test User' } });

    const mealInput = screen.getByPlaceholderText('Option 1');
    fireEvent.change(mealInput, { target: { value: 'Pizza' } });

    const createButton = screen.getByText('Create Session');
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(client.quickSessionApi.create).toHaveBeenCalledWith(
        'Test User',
        [{ title: 'Pizza', description: undefined }]
      );
      expect(sessionStorage.getItem('sessionId')).toBe('session-123');
      expect(sessionStorage.getItem('participantId')).toBe('participant-123');
      expect(sessionStorage.getItem('creatorToken')).toBe('token-123');
      expect(mockNavigate).toHaveBeenCalledWith('/session/session-123/swipe');
    });
  });

  it('should handle API errors', async () => {
    vi.mocked(client.quickSessionApi.create).mockRejectedValue(
      new Error('Network error')
    );

    renderQuickSession();

    const nameInput = screen.getByLabelText('Your Name');
    fireEvent.change(nameInput, { target: { value: 'Test User' } });

    const mealInput = screen.getByPlaceholderText('Option 1');
    fireEvent.change(mealInput, { target: { value: 'Pizza' } });

    const createButton = screen.getByText('Create Session');
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
