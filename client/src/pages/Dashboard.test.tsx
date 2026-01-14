import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard';
import { mealsApi, sessionsApi } from '../api/client';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: '1', email: 'test@example.com' },
    logout: vi.fn(),
  }),
}));

vi.mock('../api/client', () => ({
  mealsApi: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  sessionsApi: {
    list: vi.fn(),
    create: vi.fn(),
  },
}));

const mockMeals = [
  {
    id: '1',
    hostId: 'host1',
    title: 'Pizza',
    description: 'Pepperoni pizza',
    type: 'meal',
    archived: 0,
    pickCount: 5,
    createdAt: '2024-01-01',
  },
  {
    id: '2',
    hostId: 'host1',
    title: 'Tacos',
    description: 'Beef tacos',
    type: 'meal',
    archived: 0,
    pickCount: 3,
    createdAt: '2024-01-02',
  },
  {
    id: '3',
    hostId: 'host1',
    title: 'Pasta',
    description: 'Spaghetti',
    type: 'meal',
    archived: 0,
    pickCount: 0,
    createdAt: '2024-01-03',
  },
];

describe('Dashboard - Edit Mode and Delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mealsApi.list).mockResolvedValue(mockMeals);
    vi.mocked(sessionsApi.list).mockResolvedValue([]);
  });

  it('should show Edit button when meals exist', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });
  });

  it('should not show Edit button when no meals exist', async () => {
    vi.mocked(mealsApi.list).mockResolvedValue([]);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Edit')).toBeNull();
    });
  });

  it('should toggle edit mode when Edit button is clicked', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    expect(screen.getByText('Done')).toBeDefined();
    expect(screen.queryByText('Add Meal')).toBeNull();
  });

  it('should show checkboxes in edit mode', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(mockMeals.length);
  });

  it('should hide delete buttons in edit mode', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const deleteButtons = screen.getAllByTitle('Archive meal');
    expect(deleteButtons.length).toBeGreaterThan(0);

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    expect(screen.queryByTitle('Archive meal')).toBeNull();
  });

  it('should show bulk delete button when items are selected', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(screen.getByText('Delete Selected (1)')).toBeDefined();

    fireEvent.click(checkboxes[1]);
    expect(screen.getByText('Delete Selected (2)')).toBeDefined();
  });

  it('should show confirmation modal for single delete', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const deleteButton = screen.getAllByTitle('Archive meal')[0];
    fireEvent.click(deleteButton);

    expect(screen.getByText('Delete Meal?')).toBeDefined();
    expect(screen.getByText(/Are you sure you want to delete "Pizza"/)).toBeDefined();
  });

  it('should show confirmation modal for bulk delete', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    const bulkDeleteButton = screen.getByText('Delete Selected (2)');
    fireEvent.click(bulkDeleteButton);

    expect(screen.getByText('Delete 2 Meals?')).toBeDefined();
    expect(screen.getByText(/Are you sure you want to delete the following meals/)).toBeDefined();
  });

  it('should cancel single delete when Cancel is clicked', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const deleteButton = screen.getAllByTitle('Archive meal')[0];
    fireEvent.click(deleteButton);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(screen.queryByText('Delete Meal?')).toBeNull();
    expect(mealsApi.delete).not.toHaveBeenCalled();
  });

  it('should delete meal when confirmed', async () => {
    vi.mocked(mealsApi.delete).mockResolvedValue(undefined);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const deleteButton = screen.getAllByTitle('Archive meal')[0];
    fireEvent.click(deleteButton);

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mealsApi.delete).toHaveBeenCalledWith('1');
    });
  });

  it('should delete multiple meals in bulk', async () => {
    vi.mocked(mealsApi.delete).mockResolvedValue(undefined);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    const bulkDeleteButton = screen.getByText('Delete Selected (2)');
    fireEvent.click(bulkDeleteButton);

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mealsApi.delete).toHaveBeenCalledWith('1');
      expect(mealsApi.delete).toHaveBeenCalledWith('2');
    });
  });

  it('should exit edit mode after bulk delete', async () => {
    vi.mocked(mealsApi.delete).mockResolvedValue(undefined);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    const bulkDeleteButton = screen.getByText('Delete Selected (1)');
    fireEvent.click(bulkDeleteButton);

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });
  });

  it('should apply red background during single meal deletion', async () => {
    vi.mocked(mealsApi.delete).mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => resolve(undefined), 100);
      });
    });

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const deleteButton = screen.getAllByTitle('Archive meal')[0];
    fireEvent.click(deleteButton);

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    // Check if red background is applied during deletion
    await waitFor(() => {
      const mealCard = screen.getByText('Pizza').closest('.card');
      expect(mealCard?.className).toContain('bg-red-50');
    });
  });

  it('should apply red background during bulk deletion', async () => {
    vi.mocked(mealsApi.delete).mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => resolve(undefined), 100);
      });
    });

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    const bulkDeleteButton = screen.getByText('Delete Selected (2)');
    fireEvent.click(bulkDeleteButton);

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    // Check if red background is applied during deletion
    await waitFor(() => {
      const pizzaCard = screen.getByText('Pizza').closest('.card');
      const tacosCard = screen.getByText('Tacos').closest('.card');
      expect(pizzaCard?.className).toContain('bg-red-50');
      expect(tacosCard?.className).toContain('bg-red-50');
    });
  });

  it('should clear selection when toggling back to Done', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });

    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(screen.getByText('Delete Selected (1)')).toBeDefined();

    const doneButton = screen.getByText('Done');
    fireEvent.click(doneButton);

    fireEvent.click(screen.getByText('Edit'));

    expect(screen.queryByText(/Delete Selected/)).toBeNull();
  });
});
