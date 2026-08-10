import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard';
import { authApi, mealsApi, sessionsApi, Meal } from '../api/client';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: '1', email: 'test@example.com' },
    logout: vi.fn(),
  }),
}));

vi.mock('../api/client', () => ({
  authApi: {
    updatePreferences: vi.fn(),
  },
  mealsApi: {
    parseRecipe: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  sessionsApi: {
    list: vi.fn(),
    create: vi.fn(),
  },
}));

const mockMeals: Meal[] = [
  {
    id: '1',
    title: 'Pizza',
    description: 'Pepperoni pizza',
    type: 'meal',
    archived: false,
    pickCount: 5,
    createdAt: '2024-01-01',
    lastSelectedAt: '2024-01-04 12:00:00',
  },
  {
    id: '2',
    title: 'Tacos',
    description: 'Beef tacos',
    type: 'meal',
    archived: false,
    pickCount: 3,
    createdAt: '2024-01-02',
    lastSelectedAt: '2024-01-05 12:00:00',
  },
  {
    id: '3',
    title: 'Pasta',
    description: 'Spaghetti',
    type: 'meal',
    archived: false,
    pickCount: 0,
    createdAt: '2024-01-03',
    lastSelectedAt: null,
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

  it('shows each meal\'s last selection date or that it has never been selected', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    expect(await screen.findByText(/Last selected Jan 4, 2024/)).toBeDefined();
    expect(screen.getByText('Never selected')).toBeDefined();
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

  it('should toggle a meal once when its card or checkbox is clicked in edit mode', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.click(screen.getByText('Pizza'));

    expect(screen.getByText('Delete Selected (1)')).toBeDefined();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Pizza for deletion' }));

    expect(screen.queryByText('Delete Selected (1)')).toBeNull();
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
      expect(mealsApi.update).toHaveBeenCalledWith('1', { title: 'Updated Pizza', description: 'Updated description' });
    });
  });

  it('should update meal list after successful edit', async () => {
    vi.mocked(mealsApi.update).mockResolvedValue({
      id: '1',
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
      title: 'Pizza Without Description',
      description: null,
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
      expect(mealsApi.update).toHaveBeenCalledWith('1', { title: 'Pizza Without Description', description: undefined });
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
      expect(screen.getByText('Create Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create Session');
    fireEvent.click(createSessionButton);

    expect(screen.getByText('Quick add meal')).toBeDefined();
    expect(screen.getByPlaceholderText('e.g., Pizza')).toBeDefined();
  });

  it('should add meal via quick add and auto-select it', async () => {
    const newMeal: Meal = {
      id: '4',
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
      expect(screen.getByText('Create Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create Session');
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
    const newMeal: Meal = {
      id: '4',
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
      expect(screen.getByText('Create Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create Session');
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
    const newMeal: Meal = {
      id: '4',
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
      expect(screen.getByText('Create Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create Session');
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
      expect(screen.getByText('Create Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create Session');
    fireEvent.click(createSessionButton);

    const addButton = screen.getByRole('button', { name: 'Add' });
    expect(addButton).toBeDisabled();
  });

  it('should trim whitespace from quick add input', async () => {
    const newMeal: Meal = {
      id: '4',
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
      expect(screen.getByText('Create Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create Session');
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
      expect(screen.getByText('Create Session')).toBeDefined();
    });

    const createSessionButton = screen.getByText('Create Session');
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

describe('Dashboard - Home and takeout modes', () => {
  const mockCategories: Meal[] = [
    {
      id: 'category-1',
      title: 'Sushi',
      description: null,
      type: 'category',
      archived: false,
      pickCount: 0,
      createdAt: '2024-01-05',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApi.updatePreferences).mockResolvedValue({
      id: '1',
      email: 'test@example.com',
      takeoutOnboardingDismissed: true,
    });
    vi.mocked(mealsApi.list).mockImplementation(async (type) =>
      type === 'category' ? mockCategories : mockMeals
    );
    vi.mocked(sessionsApi.list).mockResolvedValue([]);
  });

  it('filters the library by tab and opens the session modal in the active mode', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await screen.findByText('My Meals');
    fireEvent.click(screen.getByRole('button', { name: 'Takeout' }));

    expect(screen.getByText('My Food Categories')).toBeInTheDocument();
    expect(screen.getByText('Sushi')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));
    expect(screen.getByText('Quick add category')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cook at home' }));
    expect(screen.getByText('Quick add meal')).toBeInTheDocument();
    expect(screen.getAllByText('Tacos').length).toBeGreaterThan(0);
  });

  it('saves and selects a missing takeout suggestion in one action', async () => {
    const mexicanCategory: Meal = {
      id: 'category-2',
      title: 'Mexican',
      description: null,
      type: 'category',
      archived: false,
      pickCount: 0,
    };
    vi.mocked(mealsApi.create).mockResolvedValue(mexicanCategory);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await screen.findByText('My Meals');
    fireEvent.click(screen.getByRole('button', { name: 'Takeout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Session' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mexican' }));

    await waitFor(() => {
      expect(mealsApi.create).toHaveBeenCalledWith('Mexican', undefined, 'category');
      expect(screen.getByRole('button', { name: /Create \(2 options\)/ })).toBeInTheDocument();
    });
  });

  it('only saves checked popular categories when onboarding is submitted', async () => {
    const barbecueCategory: Meal = {
      id: 'category-3',
      title: 'BBQ',
      description: null,
      type: 'category',
      archived: false,
      pickCount: 0,
    };
    vi.mocked(mealsApi.create).mockResolvedValue(barbecueCategory);
    vi.mocked(mealsApi.list).mockImplementation(async (type) =>
      type === 'category' ? [] : mockMeals
    );

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await screen.findByText('My Meals');
    fireEvent.click(screen.getByRole('button', { name: 'Takeout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start with popular categories' }));

    const barbecue = screen.getByRole('checkbox', { name: 'BBQ' });
    fireEvent.click(barbecue);
    expect(barbecue).toBeChecked();
    expect(mealsApi.create).not.toHaveBeenCalled();

    fireEvent.click(barbecue);
    expect(barbecue).not.toBeChecked();
    expect(mealsApi.create).not.toHaveBeenCalled();

    fireEvent.click(barbecue);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected (1)' }));

    await waitFor(() => {
      expect(mealsApi.create).toHaveBeenCalledWith('BBQ', undefined, 'category');
    });
  });

  it('keeps popular categories out of the normal add-category form after choosing to add its own', async () => {
    vi.mocked(mealsApi.list).mockImplementation(async (type) =>
      type === 'category' ? [] : mockMeals
    );

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await screen.findByText('My Meals');
    fireEvent.click(screen.getByRole('button', { name: 'Takeout' }));
    fireEvent.click(screen.getByRole('button', { name: "I'll add my own" }));

    await waitFor(() => {
      expect(authApi.updatePreferences).toHaveBeenCalledWith(true);
      expect(screen.getByText('Add Food Category')).toBeInTheDocument();
    });
    expect(screen.queryByText('Popular categories')).not.toBeInTheDocument();
  });
});

describe('Dashboard - Private Recipes', () => {
  const recipeMeal: Meal = {
    id: 'recipe-1',
    title: 'Garlic soup',
    description: 'Creamy soup',
    instructions: 'Simmer until tender.',
    ingredients: [{ amount: '2 bulbs', ingredient: 'garlic' }],
    type: 'meal',
    archived: false,
    pickCount: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mealsApi.list).mockImplementation(async (type) =>
      type === 'meal' ? [recipeMeal] : []
    );
    vi.mocked(sessionsApi.list).mockResolvedValue([]);
  });

  it('edits instructions and ordered two-field ingredient rows', async () => {
    vi.mocked(mealsApi.update).mockResolvedValue({
      ...recipeMeal,
      ingredients: [
        { amount: '2 bulbs', ingredient: 'garlic' },
        { amount: '4oz', ingredient: 'milk' },
      ],
    });

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await screen.findByText('Garlic soup');
    fireEvent.click(screen.getByTitle('Edit meal'));
    expect(screen.getByDisplayValue('Simmer until tender.')).toBeInTheDocument();
    expect(screen.getByLabelText('Ingredient 1 amount')).toHaveValue('2 bulbs');
    expect(screen.getByLabelText('Ingredient 1 name')).toHaveValue('garlic');

    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    fireEvent.change(screen.getByLabelText('Ingredient 2 amount'), {
      target: { value: '4oz' },
    });
    fireEvent.change(screen.getByLabelText('Ingredient 2 name'), {
      target: { value: 'milk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mealsApi.update).toHaveBeenCalledWith('recipe-1', {
        title: 'Garlic soup',
        description: 'Creamy soup',
        instructions: 'Simmer until tender.',
        ingredients: [
          { amount: '2 bulbs', ingredient: 'garlic' },
          { amount: '4oz', ingredient: 'milk' },
        ],
      });
    });
  });

  it('creates a home meal with an optional private recipe', async () => {
    vi.mocked(mealsApi.create).mockResolvedValue({ ...recipeMeal, id: 'recipe-2' });

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await screen.findByText('My Meals');
    fireEvent.click(screen.getByRole('button', { name: 'Add Meal' }));
    fireEvent.change(screen.getByPlaceholderText('e.g., Tacos'), {
      target: { value: 'Garlic soup' },
    });
    fireEvent.change(screen.getByPlaceholderText('Describe how to make this meal'), {
      target: { value: 'Simmer until tender.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    fireEvent.change(screen.getByLabelText('Ingredient 1 amount'), {
      target: { value: '2 bulbs' },
    });
    fireEvent.change(screen.getByLabelText('Ingredient 1 name'), {
      target: { value: 'garlic' },
    });
    const addMealButtons = screen.getAllByRole('button', { name: 'Add Meal' });
    fireEvent.click(addMealButtons[addMealButtons.length - 1]);

    await waitFor(() => {
      expect(mealsApi.create).toHaveBeenCalledWith(
        'Garlic soup',
        undefined,
        'meal',
        {
          instructions: 'Simmer until tender.',
          ingredients: [{ amount: '2 bulbs', ingredient: 'garlic' }],
        }
      );
    });
  });

  it('fills the editable meal form from backend-parsed recipe text', async () => {
    vi.mocked(mealsApi.parseRecipe).mockResolvedValue({
      title: 'Garlic Soup',
      description: 'Creamy roasted garlic soup',
      instructions: 'Roast the garlic.\nBlend and simmer.',
      ingredients: [
        { amount: '2 bulbs', ingredient: 'garlic' },
        { amount: '4oz', ingredient: 'milk' },
      ],
    });

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await screen.findByText('My Meals');
    fireEvent.click(screen.getByRole('button', { name: 'Add Meal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paste a full recipe' }));
    const recipeText = `Title: Garlic Soup
Description: Creamy roasted garlic soup
Ingredients:
2 bulbs | garlic
4oz | milk
Instructions:
Roast the garlic.
Blend and simmer.`;
    fireEvent.change(screen.getByLabelText('Recipe text to parse'), {
      target: { value: recipeText },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fill recipe form' }));

    await waitFor(() => {
      expect(mealsApi.parseRecipe).toHaveBeenCalledWith(recipeText);
      expect(screen.getByDisplayValue('Garlic Soup')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Creamy roasted garlic soup')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Describe how to make this meal'))
        .toHaveValue('Roast the garlic.\nBlend and simmer.');
      expect(screen.getByLabelText('Ingredient 1 amount')).toHaveValue('2 bulbs');
      expect(screen.getByLabelText('Ingredient 2 name')).toHaveValue('milk');
    });
  });

  it('opens a readable recipe by clicking its library name', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await screen.findByText('My Meals');
    fireEvent.click(screen.getByRole('button', { name: 'Garlic soup' }));

    const dialog = screen.getByRole('dialog', { name: 'Garlic soup' });
    expect(within(dialog).getByText('2 bulbs')).toBeInTheDocument();
    expect(within(dialog).getByText('garlic')).toBeInTheDocument();
    expect(within(dialog).getByText('Simmer until tender.')).toBeInTheDocument();
  });

  it('opens the selected meal recipe from Recent Sessions', async () => {
    vi.mocked(mealsApi.get).mockResolvedValue(recipeMeal);
    vi.mocked(sessionsApi.list).mockResolvedValue([{
      id: 'session-1',
      inviteCode: 'ABC123',
      status: 'closed',
      mode: 'home',
      selectedMealId: 'recipe-1',
      selectedMeal: { id: 'recipe-1', title: 'Garlic soup', type: 'meal' },
      mealCount: 1,
      participantCount: 2,
      createdAt: '2024-01-01',
      closedAt: '2024-01-01',
    }]);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    const recentSessions = (await screen.findByText('Recent Sessions')).closest('section');
    expect(recentSessions).not.toBeNull();
    expect(within(recentSessions!).getByRole('heading', { name: /Winner:\s*Garlic soup/ }))
      .toBeInTheDocument();
    expect(within(recentSessions!).getByText('Invite code:', { exact: false })).toBeInTheDocument();
    expect(within(recentSessions!).getByText('ABC123')).toBeInTheDocument();
    fireEvent.click(within(recentSessions!).getByRole('button', { name: 'Garlic soup' }));

    await waitFor(() => expect(mealsApi.get).toHaveBeenCalledWith('recipe-1'));
    expect(screen.getByRole('dialog', { name: 'Garlic soup' })).toBeInTheDocument();
  });

  it('does not show a winner heading when a closed session has no final selection', async () => {
    vi.mocked(sessionsApi.list).mockResolvedValue([{
      id: 'session-1',
      inviteCode: 'ABC123',
      status: 'closed',
      mode: 'home',
      selectedMealId: null,
      selectedMeal: null,
      mealCount: 1,
      participantCount: 2,
      createdAt: '2024-01-01',
      closedAt: '2024-01-01',
    }]);

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    const recentSessions = (await screen.findByText('Recent Sessions')).closest('section');
    expect(recentSessions).not.toBeNull();
    expect(within(recentSessions!).queryByRole('heading', { name: /Winner:/ })).not.toBeInTheDocument();
    expect(within(recentSessions!).getByText('ABC123')).toBeInTheDocument();
  });

  it('does not show recipe fields for takeout categories', async () => {
    vi.mocked(mealsApi.list).mockImplementation(async (type) =>
      type === 'category'
        ? [{
            ...recipeMeal,
            id: 'category-1',
            title: 'Italian',
            type: 'category',
            instructions: undefined,
            ingredients: undefined,
          }]
        : []
    );

    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );

    await screen.findByText('My Meals');
    fireEvent.click(screen.getByRole('button', { name: 'Takeout' }));
    fireEvent.click(screen.getByTitle('Edit category'));
    expect(screen.queryByText('Recipe (optional)')).not.toBeInTheDocument();
  });
});
