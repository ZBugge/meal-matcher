import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Results } from './Results';
import { mealsApi, participantApi } from '../api/client';

vi.mock('../api/client', () => ({
  ApiException: class ApiException extends Error {
    existingId?: string;
  },
  participantApi: {
    getResults: vi.fn(),
    getSessionStatus: vi.fn(),
    closeSession: vi.fn(),
  },
  mealsApi: {
    get: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'host-1', email: 'host@example.com' },
    logout: vi.fn(),
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ sessionId: 'session-1' }),
    useNavigate: () => vi.fn(),
  };
});

const closedResults = {
  status: 'closed' as const,
  mode: 'home' as const,
  isHost: true,
  results: [{
    mealId: 'meal-1',
    title: 'Garlic Soup',
    description: 'Creamy soup',
    yesCount: 2,
    maybeCount: 0,
    totalVotes: 2,
    percentage: 100,
    isUnanimous: true,
  }],
};

describe('Results - Host recipe viewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(participantApi.getResults).mockResolvedValue(closedResults);
    vi.mocked(mealsApi.get).mockResolvedValue({
      id: 'meal-1',
      title: 'Garlic Soup',
      description: 'Creamy soup',
      instructions: 'Simmer until tender.',
      ingredients: [{ amount: '2 bulbs', ingredient: 'garlic' }],
      type: 'meal',
      pickCount: 1,
    });
  });

  it('opens a private recipe when the authenticated host clicks a result name', async () => {
    render(
      <BrowserRouter>
        <Results />
      </BrowserRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Garlic Soup' }));

    await waitFor(() => expect(mealsApi.get).toHaveBeenCalledWith('meal-1'));
    const dialog = screen.getByRole('dialog', { name: 'Garlic Soup' });
    expect(within(dialog).getByText('2 bulbs')).toBeInTheDocument();
    expect(within(dialog).getByText('Simmer until tender.')).toBeInTheDocument();
  });

  it('keeps result names non-interactive when the logged-in user is not the host', async () => {
    vi.mocked(participantApi.getResults).mockResolvedValue({
      ...closedResults,
      isHost: false,
    });

    render(
      <BrowserRouter>
        <Results />
      </BrowserRouter>
    );

    await screen.findByText('Garlic Soup');
    expect(screen.queryByRole('button', { name: 'Garlic Soup' })).not.toBeInTheDocument();
    expect(mealsApi.get).not.toHaveBeenCalled();
  });
});
