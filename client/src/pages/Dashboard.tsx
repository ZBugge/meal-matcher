import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { authApi, mealsApi, sessionsApi, Meal, Session, SessionMode } from '../api/client';
import ConfirmModal from '../components/ConfirmModal';
import { TAKEOUT_CATEGORY_SUGGESTIONS } from '../constants/takeoutCategories';

function formatLastSelectedAt(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Never selected';

  const date = new Date(`${timestamp.replace(' ', 'T')}Z`);
  return `Last selected ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)}`;
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeMode, setActiveMode] = useState<SessionMode>('home');

  // Modal states
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [newMealTitle, setNewMealTitle] = useState('');
  const [newMealDescription, setNewMealDescription] = useState('');
  const [selectedMealIds, setSelectedMealIds] = useState<string[]>([]);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [sessionMode, setSessionMode] = useState<SessionMode>('home');
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null);
  const [showTakeoutOnboarding, setShowTakeoutOnboarding] = useState(false);
  const [selectedStarterCategories, setSelectedStarterCategories] = useState<string[]>([]);
  const [takeoutOnboardingDismissed, setTakeoutOnboardingDismissed] = useState(
    Boolean(user?.takeoutOnboardingDismissed)
  );

  // Edit mode states
  const [editMode, setEditMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<string[]>([]);

  // Confirmation modal states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [mealToDelete, setMealToDelete] = useState<Meal | null>(null);

  // Edit modal states
  const [showEditMeal, setShowEditMeal] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Animation states
  const [deletingMealIds, setDeletingMealIds] = useState<string[]>([]);

  const activeType = activeMode === 'home' ? 'meal' : 'category';
  const activeMeals = meals.filter((meal) => meal.type === activeType);
  const sessionType = sessionMode === 'home' ? 'meal' : 'category';
  const sessionMeals = meals.filter((meal) => meal.type === sessionType);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setTakeoutOnboardingDismissed(Boolean(user?.takeoutOnboardingDismissed));
  }, [user?.takeoutOnboardingDismissed]);

  const loadData = async () => {
    try {
      const [homeMealsData, categoriesData, sessionsData] = await Promise.all([
        mealsApi.list('meal'),
        mealsApi.list('category'),
        sessionsApi.list(),
      ]);
      setMeals([
        ...homeMealsData.filter((meal) => meal.type === 'meal'),
        ...categoriesData.filter((meal) => meal.type === 'category'),
      ]);
      setSessions(sessionsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const markTakeoutOnboardingComplete = async (): Promise<boolean> => {
    try {
      await authApi.updatePreferences(true);
      setTakeoutOnboardingDismissed(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save your takeout setup preference');
      return false;
    }
  };

  const handleAddMeal = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const meal = activeMode === 'home'
        ? await mealsApi.create(newMealTitle.trim(), newMealDescription || undefined)
        : await mealsApi.create(newMealTitle.trim(), undefined, 'category');
      setMeals((current) => [meal, ...current]);
      setNewMealTitle('');
      setNewMealDescription('');
      setShowAddMeal(false);
      if (activeMode === 'takeout') {
        setTakeoutOnboardingDismissed(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to add ${activeMode === 'home' ? 'meal' : 'category'}`);
    }
  };

  const openAddMeal = () => {
    setNewMealTitle('');
    setNewMealDescription('');
    setShowAddMeal(true);
  };

  const closeAddMeal = () => {
    setNewMealTitle('');
    setNewMealDescription('');
    setShowAddMeal(false);
  };

  const toggleStarterCategory = (title: string) => {
    setSelectedStarterCategories((current) =>
      current.includes(title)
        ? current.filter((suggestion) => suggestion !== title)
        : [...current, title]
    );
  };

  const openTakeoutOnboarding = () => {
    setSelectedStarterCategories([]);
    setShowTakeoutOnboarding(true);
  };

  const handleAddStarterCategories = async () => {
    if (selectedStarterCategories.length === 0) {
      setError('Choose at least one category to add');
      return;
    }

    try {
      const categories = await Promise.all(
        selectedStarterCategories.map((title) => mealsApi.create(title, undefined, 'category'))
      );
      setMeals((current) => [...categories, ...current]);
      setShowTakeoutOnboarding(false);
      setSelectedStarterCategories([]);
      setTakeoutOnboardingDismissed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add food categories');
    }
  };

  const handleAddOwnCategory = async () => {
    if (await markTakeoutOnboardingComplete()) {
      openAddMeal();
    }
  };

  const openEditMeal = (meal: Meal) => {
    setEditingMeal(meal);
    setEditTitle(meal.title);
    setEditDescription(meal.description || '');
    setShowEditMeal(true);
  };

  const handleUpdateMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMeal) return;

    try {
      await mealsApi.update(editingMeal.id, {
        title: editTitle,
        ...(editingMeal.type === 'meal'
          ? { description: editDescription || undefined }
          : {}),
      });
      setMeals(meals.map((m) =>
        m.id === editingMeal.id
          ? {
              ...m,
              title: editTitle,
              description: editingMeal.type === 'meal' ? editDescription || null : null,
            }
          : m
      ));
      setShowEditMeal(false);
      setEditingMeal(null);
      setEditTitle('');
      setEditDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update meal');
    }
  };

  const handleDeleteMeal = async (id: string) => {
    try {
      // Mark as deleting to trigger animation
      setDeletingMealIds([id]);

      await mealsApi.delete(id);

      // Wait for animation to complete before removing from state
      setTimeout(() => {
        setMeals(meals.filter((m) => m.id !== id));
        setDeletingMealIds([]);
      }, 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete meal');
      setDeletingMealIds([]);
    }
  };

  const confirmDeleteSingleMeal = (meal: Meal) => {
    setMealToDelete(meal);
    setShowDeleteConfirm(true);
  };

  const handleConfirmSingleDelete = async () => {
    if (!mealToDelete) return;

    await handleDeleteMeal(mealToDelete.id);
    setShowDeleteConfirm(false);
    setMealToDelete(null);
  };

  const handleBulkDelete = async () => {
    try {
      // Mark all selected meals as deleting to trigger animation
      setDeletingMealIds(selectedForDeletion);

      await Promise.all(selectedForDeletion.map((id) => mealsApi.delete(id)));

      // Wait for animation to complete before removing from state
      setTimeout(() => {
        setMeals(meals.filter((m) => !selectedForDeletion.includes(m.id)));
        setSelectedForDeletion([]);
        setDeletingMealIds([]);
        setEditMode(false);
        setShowDeleteConfirm(false);
      }, 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete meals');
      setDeletingMealIds([]);
    }
  };

  const confirmBulkDelete = () => {
    setShowDeleteConfirm(true);
  };

  const toggleEditMode = () => {
    setEditMode(!editMode);
    setSelectedForDeletion([]);
  };

  const toggleMealForDeletion = (id: string) => {
    setSelectedForDeletion((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  const handleCreateSession = async () => {
    if (selectedMealIds.length === 0) {
      setError('Select at least one option');
      return;
    }

    try {
      const session = await sessionsApi.create(selectedMealIds, sessionMode);
      navigate(`/session/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const openCreateSession = () => {
    setSessionMode(activeMode);
    setSelectedMealIds(activeMeals.map((meal) => meal.id));
    setQuickAddTitle('');
    setShowCreateSession(true);
  };

  const changeSessionMode = (mode: SessionMode) => {
    setSessionMode(mode);
    const type = mode === 'home' ? 'meal' : 'category';
    setSelectedMealIds(meals.filter((meal) => meal.type === type).map((meal) => meal.id));
    setQuickAddTitle('');
  };

  const changeActiveMode = (mode: SessionMode) => {
    setActiveMode(mode);
    setEditMode(false);
    setSelectedForDeletion([]);
  };

  const toggleMealSelection = (id: string) => {
    setSelectedMealIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  const handleQuickAddMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddTitle.trim()) return;

    try {
      const meal = sessionMode === 'home'
        ? await mealsApi.create(quickAddTitle.trim(), undefined)
        : await mealsApi.create(quickAddTitle.trim(), undefined, 'category');
      setMeals((current) => [meal, ...current]);
      setSelectedMealIds((current) => [...current, meal.id]);
      setQuickAddTitle('');
      if (sessionMode === 'takeout') {
        setTakeoutOnboardingDismissed(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add meal');
    }
  };

  const handleTakeoutSuggestion = async (title: string, selectForSession: boolean) => {
    const existing = meals.find(
      (meal) => meal.type === 'category' && meal.title.toLowerCase() === title.toLowerCase()
    );

    if (existing) {
      if (selectForSession) {
        setSelectedMealIds((current) =>
          current.includes(existing.id) ? current : [...current, existing.id]
        );
      }
      return;
    }

    setAddingSuggestion(title);
    try {
      const category = await mealsApi.create(title, undefined, 'category');
      setMeals((current) => [category, ...current]);
      setTakeoutOnboardingDismissed(true);
      if (selectForSession) {
        setSelectedMealIds((current) => [...current, category.id]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add food category');
    } finally {
      setAddingSuggestion(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-primary-600">MealMatch</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button onClick={handleLogout} className="text-sm text-gray-600 hover:text-gray-900">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-6">
            {error}
            <button onClick={() => setError('')} className="ml-2 font-bold">
              ×
            </button>
          </div>
        )}

        {/* Saved options */}
        <section className="mb-12">
          <div className="inline-flex rounded-lg bg-gray-100 p-1 mb-6" aria-label="Food library">
            <button
              onClick={() => changeActiveMode('home')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeMode === 'home' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              Home meals
            </button>
            <button
              onClick={() => changeActiveMode('takeout')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeMode === 'takeout' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              Takeout
            </button>
          </div>

          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">
                {activeMode === 'home' ? 'My Meals' : 'My Food Categories'}
              </h2>
              {activeMeals.length > 0 && (
                <>
                  <button
                    onClick={toggleEditMode}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {editMode ? 'Done' : 'Edit'}
                  </button>
                  {editMode && selectedForDeletion.length > 0 && (
                    <button
                      onClick={confirmBulkDelete}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Delete Selected ({selectedForDeletion.length})
                    </button>
                  )}
                </>
              )}
            </div>
            {!editMode && (
              <button onClick={openAddMeal} className="btn btn-primary">
                {activeMode === 'home' ? 'Add Meal' : 'Add Category'}
              </button>
            )}
          </div>

          {activeMeals.length === 0 ? (
            activeMode === 'takeout' && !takeoutOnboardingDismissed ? (
              <div className="card text-center py-12">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Build your takeout list</h3>
                <p className="text-gray-500 mb-5">
                  Start with a few popular categories, or add your own from scratch.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-3">
                  <button onClick={openTakeoutOnboarding} className="btn btn-primary">
                    Start with popular categories
                  </button>
                  <button onClick={handleAddOwnCategory} className="btn btn-secondary">
                    I&apos;ll add my own
                  </button>
                </div>
              </div>
            ) : (
              <div className="card text-center py-12">
                <p className="text-gray-500 mb-4">
                  {activeMode === 'home'
                    ? 'No meals yet. Add some to get started!'
                    : 'No takeout categories yet. Add your favorites to get started!'}
                </p>
                <button onClick={openAddMeal} className="btn btn-primary">
                  {activeMode === 'home' ? 'Add Your First Meal' : 'Add Your First Category'}
                </button>
              </div>
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <AnimatePresence mode="popLayout">
                {activeMeals.map((meal) => {
                  const isDeleting = deletingMealIds.includes(meal.id);
                  const isSingleDelete = deletingMealIds.length === 1 && isDeleting;
                  const isSelectedForDeletion = selectedForDeletion.includes(meal.id);

                  return (
                    <motion.div
                      key={meal.id}
                      layout
                      onClick={editMode ? () => toggleMealForDeletion(meal.id) : undefined}
                      initial={{ opacity: 1 }}
                      exit={
                        isSingleDelete
                          ? {
                              x: -100,
                              opacity: 0,
                              transition: { duration: 0.3 },
                            }
                          : {
                              opacity: 0,
                              transition: { duration: 0.3 },
                            }
                      }
                      className={`card transition-colors duration-150 ${
                        editMode ? 'cursor-pointer' : ''
                      } ${isDeleting ? 'bg-red-50' : ''}`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        {editMode && (
                          <input
                            type="checkbox"
                            checked={isSelectedForDeletion}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => toggleMealForDeletion(meal.id)}
                            aria-label={`Select ${meal.title} for deletion`}
                            className="w-5 h-5 mt-1 text-primary-600 cursor-pointer"
                          />
                        )}
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{meal.title}</h3>
                          {meal.description && (
                            <p className="text-gray-600 text-sm mt-1">{meal.description}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-2">
                            {meal.pickCount > 0 && (
                              <>Selected {meal.pickCount} time{meal.pickCount !== 1 ? 's' : ''} · </>
                            )}
                            {formatLastSelectedAt(meal.lastSelectedAt)}
                          </p>
                        </div>
                        {!editMode && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditMeal(meal)}
                              className="text-gray-400 hover:text-primary-500"
                              title={meal.type === 'category' ? 'Edit category' : 'Edit meal'}
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => confirmDeleteSingleMeal(meal)}
                              className="text-gray-400 hover:text-red-500"
                              title={meal.type === 'category' ? 'Archive category' : 'Archive meal'}
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* Create Session Buttons */}
        <section className="mb-12">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => navigate('/')}
              className="btn btn-secondary py-4 text-lg"
            >
              Quick Session
            </button>
            {meals.length > 0 ? (
              <button
                onClick={openCreateSession}
                className="btn btn-success py-4 text-lg"
              >
                Create Session
              </button>
            ) : null}
          </div>
          {meals.length === 0 ? (
            <p className="text-sm text-gray-600 mt-2 text-center">
              Add saved options to create a session from your library, or use Quick Session to start immediately.
            </p>
          ) : null}
        </section>

        {/* Sessions Section */}
        <section>
          <h2 className="text-2xl font-bold mb-4">Recent Sessions</h2>

          {sessions.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-500">No sessions yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="card cursor-pointer hover:shadow-xl transition-shadow"
                  onClick={() => navigate(`/session/${session.id}`)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-lg">{session.inviteCode}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700">
                          {session.mode === 'takeout' ? 'Order out' : 'Cook at home'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            session.status === 'open'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {session.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {session.mealCount} options · {session.participantCount} participants
                      </p>
                    </div>
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Takeout onboarding modal */}
      {showTakeoutOnboarding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="card w-full max-w-lg">
            <h3 className="text-xl font-bold mb-2">Start with popular categories</h3>
            <p className="text-sm text-gray-600 mb-5">
              Pick the kinds of food you&apos;d like to consider. You can always add or remove categories later.
            </p>
            <fieldset>
              <legend className="sr-only">Popular categories</legend>
              <div className="grid grid-cols-2 gap-2">
                {TAKEOUT_CATEGORY_SUGGESTIONS.map((suggestion) => {
                  const selected = selectedStarterCategories.includes(suggestion);
                  return (
                    <label
                      key={suggestion}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                        selected
                          ? 'bg-orange-100 border-orange-300 text-orange-800'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-orange-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleStarterCategory(suggestion)}
                        className="accent-orange-500"
                      />
                      {suggestion}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowTakeoutOnboarding(false)}
                className="btn btn-secondary flex-1"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleAddStarterCategories}
                disabled={selectedStarterCategories.length === 0}
                className="btn btn-primary flex-1"
              >
                Add selected ({selectedStarterCategories.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Meal Modal */}
      {showAddMeal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="card w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">
              {activeMode === 'home' ? 'Add New Meal' : 'Add Food Category'}
            </h3>
            <form onSubmit={handleAddMeal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={newMealTitle}
                  onChange={(e) => setNewMealTitle(e.target.value)}
                  className="input"
                  placeholder={activeMode === 'home' ? 'e.g., Tacos' : 'e.g., Korean'}
                  required
                  autoFocus
                />
              </div>
              {activeMode === 'home' && <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={newMealDescription}
                  onChange={(e) => setNewMealDescription(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="e.g., Beef tacos with all the fixings"
                />
              </div>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeAddMeal}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  {activeMode === 'home' ? 'Add Meal' : 'Add Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Meal Modal */}
      {showEditMeal && editingMeal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="card w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">
              {editingMeal.type === 'category' ? 'Edit Category' : 'Edit Meal'}
            </h3>
            <form onSubmit={handleUpdateMeal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="input"
                  placeholder={editingMeal.type === 'category' ? 'e.g., Korean' : 'e.g., Tacos'}
                  required
                  autoFocus
                />
              </div>
              {editingMeal.type === 'meal' && <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="e.g., Beef tacos with all the fixings"
                />
              </div>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditMeal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Session Modal */}
      {showCreateSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="card w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <h3 className="text-xl font-bold mb-4">Create Session</h3>

            <div className="grid grid-cols-2 gap-2 bg-gray-100 rounded-lg p-1 mb-4">
              <button
                type="button"
                onClick={() => changeSessionMode('home')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  sessionMode === 'home' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                }`}
              >
                Cook at home
              </button>
              <button
                type="button"
                onClick={() => changeSessionMode('takeout')}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  sessionMode === 'takeout' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                }`}
              >
                Order out
              </button>
            </div>

            {sessionMode === 'takeout' && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Quick picks</p>
                <div className="flex flex-wrap gap-2">
                  {TAKEOUT_CATEGORY_SUGGESTIONS.map((suggestion) => {
                    const existing = meals.find(
                      (meal) => meal.type === 'category'
                        && meal.title.toLowerCase() === suggestion.toLowerCase()
                    );
                    const selected = existing ? selectedMealIds.includes(existing.id) : false;
                    return (
                      <button
                        key={suggestion}
                        type="button"
                        disabled={addingSuggestion === suggestion}
                        onClick={() => handleTakeoutSuggestion(suggestion, true)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                          selected
                            ? 'bg-orange-100 border-orange-300 text-orange-800'
                            : 'bg-white border-gray-300 text-gray-700 hover:border-orange-400'
                        }`}
                      >
                        {selected ? `✓ ${suggestion}` : suggestion}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Add Meal */}
            <form onSubmit={handleQuickAddMeal} className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {sessionMode === 'home' ? 'Quick add meal' : 'Quick add category'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quickAddTitle}
                  onChange={(e) => setQuickAddTitle(e.target.value)}
                  className="input flex-1"
                  placeholder={sessionMode === 'home' ? 'e.g., Pizza' : 'e.g., Korean'}
                />
                <button
                  type="submit"
                  disabled={!quickAddTitle.trim()}
                  className="btn btn-primary"
                >
                  Add
                </button>
              </div>
            </form>

            <p className="text-gray-600 text-sm mb-4">
              Select {sessionMode === 'home' ? 'meals' : 'food categories'} to include:
            </p>

            {sessionMeals.length > 30 && (
              <div className="bg-yellow-50 text-yellow-700 px-3 py-2 rounded text-sm mb-4">
                With {sessionMeals.length} options, sessions may take longer to complete.
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {sessionMeals.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No saved {sessionMode === 'home' ? 'meals' : 'categories'} yet. Add one above.
                </p>
              )}
              {sessionMeals.map((meal) => (
                <label
                  key={meal.id}
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedMealIds.includes(meal.id)}
                    onChange={() => toggleMealSelection(meal.id)}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="font-medium">{meal.title}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateSession(false)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSession}
                disabled={selectedMealIds.length === 0}
                className="btn btn-success flex-1"
              >
                Create ({selectedMealIds.length} options)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title={mealToDelete
          ? `Delete ${mealToDelete.type === 'category' ? 'Category' : 'Meal'}?`
          : `Delete ${selectedForDeletion.length} ${activeMode === 'takeout' ? 'Categor' : 'Meal'}${
              activeMode === 'takeout'
                ? selectedForDeletion.length === 1 ? 'y' : 'ies'
                : selectedForDeletion.length !== 1 ? 's' : ''
            }?`}
        message={
          mealToDelete
            ? `Are you sure you want to delete "${mealToDelete.title}"?`
            : `Are you sure you want to delete the following ${activeMode === 'takeout' ? 'categories' : 'meals'}?\n\n${meals
                .filter((m) => selectedForDeletion.includes(m.id))
                .map((m) => `• ${m.title}`)
                .join('\n')}`
        }
        onConfirm={mealToDelete ? handleConfirmSingleDelete : handleBulkDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setMealToDelete(null);
        }}
      />
    </div>
  );
}
