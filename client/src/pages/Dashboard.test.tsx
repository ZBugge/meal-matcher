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
    update: vi.fn(),
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
    archived: false,
    pickCount: 5,
    createdAt: '2024-01-01',
  },
  {
    id: '2',
    hostId: 'host1',
    title: 'Tacos',
    description: 'Beef tacos',
    type: 'meal',
    archived: false,
    pickCount: 3,
    createdAt: '2024-01-02',
  },
  {
    id: '3',
    hostId: 'host1',
    title: 'Pasta',
    description: 'Spaghetti',
    type: 'meal',
    archived: false,
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
    vi.mocked(mealsApi.delete).mockResolvedValue({ message: 'Deleted' });

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
    vi.mocked(mealsApi.delete).mockResolvedValue({ message: 'Deleted' });

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
    vi.mocked(mealsApi.delete).mockResolvedValue({ message: 'Deleted' });

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
        setTimeout(() => resolve({ message: 'Deleted' }), 100);
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
        setTimeout(() => resolve({ message: 'Deleted' }), 100);
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

describe('Dashboard - Edit Meal Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mealsApi.list).mockResolvedValue(mockMeals);
    vi.mocked(sessionsApi.list).mockResolvedValue([]);
  });

  it('should show edit button for each meal', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const editButtons = screen.getAllByTitle('Edit meal');
    expect(editButtons.length).toBe(mockMeals.length);
  });

  it('should hide edit buttons in edit mode', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const editButtons = screen.getAllByTitle('Edit meal');
    expect(editButtons.length).toBeGreaterThan(0);

    const editModeButton = screen.getByText('Edit');
    fireEvent.click(editModeButton);

    expect(screen.queryByTitle('Edit meal')).toBeNull();
  });

  it('should open edit modal when edit button is clicked', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const editButton = screen.getAllByTitle('Edit meal')[0];
    fireEvent.click(editButton);

    expect(screen.getByText('Edit Meal')).toBeDefined();
    expect(screen.getByDisplayValue('Pizza')).toBeDefined();
    expect(screen.getByDisplayValue('Pepperoni pizza')).toBeDefined();
  });

  it('should populate form with meal data', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Tacos')).toBeDefined();
    });

    const editButton = screen.getAllByTitle('Edit meal')[1];
    fireEvent.click(editButton);

    const titleInput = screen.getByDisplayValue('Tacos');
    const descriptionInput = screen.getByDisplayValue('Beef tacos');

    expect(titleInput).toBeDefined();
    expect(descriptionInput).toBeDefined();
  });

  it('should close modal when Cancel is clicked', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const editButton = screen.getAllByTitle('Edit meal')[0];
    fireEvent.click(editButton);

    expect(screen.getByText('Edit Meal')).toBeDefined();

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(screen.queryByText('Edit Meal')).toBeNull();
    expect(mealsApi.update).not.toHaveBeenCalled();
  });

  it('should update meal when form is submitted', async () => {
    vi.mocked(mealsApi.update).mockResolvedValue({
      id: '1',
      hostId: 'host1',
      title: 'Updated Pizza',
      description: 'Updated description',
      type: 'meal',
      archived: false,
      pickCount: 5,
      createdAt: '2024-01-01',
    });

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const editButton = screen.getAllByTitle('Edit meal')[0];
    fireEvent.click(editButton);

    const titleInput = screen.getByDisplayValue('Pizza');
    const descriptionInput = screen.getByDisplayValue('Pepperoni pizza');

    fireEvent.change(titleInput, { target: { value: 'Updated Pizza' } });
    fireEvent.change(descriptionInput, { target: { value: 'Updated description' } });

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mealsApi.update).toHaveBeenCalledWith('1', 'Updated Pizza', 'Updated description');
    });
  });

  it('should update meal list after successful edit', async () => {
    vi.mocked(mealsApi.update).mockResolvedValue({
      id: '1',
      hostId: 'host1',
      title: 'Updated Pizza',
      description: 'New description',
      type: 'meal',
      archived: false,
      pickCount: 5,
      createdAt: '2024-01-01',
    });

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const editButton = screen.getAllByTitle('Edit meal')[0];
    fireEvent.click(editButton);

    const titleInput = screen.getByDisplayValue('Pizza');
    fireEvent.change(titleInput, { target: { value: 'Updated Pizza' } });

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.queryByText('Edit Meal')).toBeNull();
      expect(screen.getByText('Updated Pizza')).toBeDefined();
    });
  });

  it('should require title field', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const editButton = screen.getAllByTitle('Edit meal')[0];
    fireEvent.click(editButton);

    const titleInput = screen.getByDisplayValue('Pizza') as HTMLInputElement;
    expect(titleInput.required).toBe(true);
  });

  it('should handle description as optional', async () => {
    vi.mocked(mealsApi.update).mockResolvedValue({
      id: '1',
      hostId: 'host1',
      title: 'Pizza Without Description',
      description: undefined,
      type: 'meal',
      archived: false,
      pickCount: 5,
      createdAt: '2024-01-01',
    });

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const editButton = screen.getAllByTitle('Edit meal')[0];
    fireEvent.click(editButton);

    const titleInput = screen.getByDisplayValue('Pizza');
    const descriptionInput = screen.getByDisplayValue('Pepperoni pizza');

    fireEvent.change(titleInput, { target: { value: 'Pizza Without Description' } });
    fireEvent.change(descriptionInput, { target: { value: '' } });

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mealsApi.update).toHaveBeenCalledWith('1', 'Pizza Without Description', undefined);
    });
  });

  it('should show error message when update fails', async () => {
    vi.mocked(mealsApi.update).mockRejectedValue(new Error('Update failed'));

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Pizza')).toBeDefined();
    });

    const editButton = screen.getAllByTitle('Edit meal')[0];
    fireEvent.click(editButton);

    const titleInput = screen.getByDisplayValue('Pizza');
    fireEvent.change(titleInput, { target: { value: 'Updated Pizza' } });

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeDefined();
    });
  });
});

describe('Dashboard - Quick Add Meal in Create Session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mealsApi.list).mockResolvedValue(mockMeals);
    vi.mocked(sessionsApi.list).mockResolvedValue([]);
  });

  it('should display quick add input in create session modal', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create New Session');
    fireEvent.click(createSessionButton);

    expect(screen.getByText('Quick add meal')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g., Pizza')).toBeDefined();
  });

  it('should add meal via quick add and auto-select it', async () => {
    const newMeal = {
      id: '4',
      hostId: 'host1',
      title: 'Burger',
      description: '',
      type: 'meal',
      archived: false,
      pickCount: 0,
      createdAt: '2024-01-04',
    };

    vi.mocked(mealsApi.create).mockResolvedValue(newMeal);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create New Session');
    fireEvent.click(createSessionButton);

    const quickAddInput = screen.getByPlaceholderText('e.g., Pizza');
    fireEvent.change(quickAddInput, { target: { value: 'Burger' } });

    const addButton = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mealsApi.create).toHaveBeenCalledWith('Burger', undefined);
    });

    await waitFor(() => {
      expect(screen.getAllByText('Burger').length).toBeGreaterThan(0);
    });
  });

  it('should clear input after quick add', async () => {
    const newMeal = {
      id: '4',
      hostId: 'host1',
      title: 'Burger',
      description: '',
      type: 'meal',
      archived: false,
      pickCount: 0,
      createdAt: '2024-01-04',
    };

    vi.mocked(mealsApi.create).mockResolvedValue(newMeal);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create New Session');
    fireEvent.click(createSessionButton);

    const quickAddInput = screen.getByPlaceholderText('e.g., Pizza') as HTMLInputElement;
    fireEvent.change(quickAddInput, { target: { value: 'Burger' } });

    const addButton = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(quickAddInput.value).toBe('');
    });
  });

  it('should submit quick add on Enter key', async () => {
    const newMeal = {
      id: '4',
      hostId: 'host1',
      title: 'Burger',
      description: '',
      type: 'meal',
      archived: false,
      pickCount: 0,
      createdAt: '2024-01-04',
    };

    vi.mocked(mealsApi.create).mockResolvedValue(newMeal);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create New Session');
    fireEvent.click(createSessionButton);

    const quickAddInput = screen.getByPlaceholderText('e.g., Pizza');
    fireEvent.change(quickAddInput, { target: { value: 'Burger' } });
    fireEvent.submit(quickAddInput.closest('form')!);

    await waitFor(() => {
      expect(mealsApi.create).toHaveBeenCalledWith('Burger', undefined);
    });
  });

  it('should disable Add button when input is empty', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create New Session');
    fireEvent.click(createSessionButton);

    const addButton = screen.getByRole('button', { name: 'Add' });
    expect(addButton).toBeDisabled();
  });

  it('should trim whitespace from quick add input', async () => {
    const newMeal = {
      id: '4',
      hostId: 'host1',
      title: 'Burger',
      description: '',
      type: 'meal',
      archived: false,
      pickCount: 0,
      createdAt: '2024-01-04',
    };

    vi.mocked(mealsApi.create).mockResolvedValue(newMeal);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create New Session');
    fireEvent.click(createSessionButton);

    const quickAddInput = screen.getByPlaceholderText('e.g., Pizza');
    fireEvent.change(quickAddInput, { target: { value: '  Burger  ' } });

    const addButton = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mealsApi.create).toHaveBeenCalledWith('Burger', undefined);
    });
  });

  it('should handle API error in quick add', async () => {
    vi.mocked(mealsApi.create).mockRejectedValue(new Error('Failed to create meal'));

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Create New Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create New Session');
    fireEvent.click(createSessionButton);

    const quickAddInput = screen.getByPlaceholderText('e.g., Pizza');
    fireEvent.change(quickAddInput, { target: { value: 'Burger' } });

    const addButton = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to create meal')).toBeDefined();
    });
  });
});
