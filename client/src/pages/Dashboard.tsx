import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { mealsApi, sessionsApi, Meal, Session } from '../api/client';
import ConfirmModal from '../components/ConfirmModal';

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal states
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [newMealTitle, setNewMealTitle] = useState('');
  const [newMealDescription, setNewMealDescription] = useState('');
  const [selectedMealIds, setSelectedMealIds] = useState<string[]>([]);

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [mealsData, sessionsData] = await Promise.all([
        mealsApi.list(),
        sessionsApi.list(),
      ]);
      setMeals(mealsData);
      setSessions(sessionsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const meal = await mealsApi.create(newMealTitle, newMealDescription || undefined);
      setMeals([meal, ...meals]);
      setNewMealTitle('');
      setNewMealDescription('');
      setShowAddMeal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add meal');
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
      await mealsApi.update(editingMeal.id, editTitle, editDescription || undefined);
      setMeals(meals.map((m) =>
        m.id === editingMeal.id
          ? { ...m, title: editTitle, description: editDescription || undefined }
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
      setError('Select at least one meal');
      return;
    }

    try {
      const session = await sessionsApi.create(selectedMealIds);
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
    setSelectedMealIds(meals.map((m) => m.id)); // Select all by default
    setShowCreateSession(true);
  };

  const toggleMealSelection = (id: string) => {
    setSelectedMealIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
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

        {/* Meals Section */}
        <section className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">My Meals</h2>
              {meals.length > 0 && (
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
              <button onClick={() => setShowAddMeal(true)} className="btn btn-primary">
                Add Meal
              </button>
            )}
          </div>

          {meals.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500 mb-4">No meals yet. Add some to get started!</p>
              <button onClick={() => setShowAddMeal(true)} className="btn btn-primary">
                Add Your First Meal
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <AnimatePresence mode="popLayout">
                {meals.map((meal) => {
                  const isDeleting = deletingMealIds.includes(meal.id);
                  const isSingleDelete = deletingMealIds.length === 1 && isDeleting;

                  return (
                    <motion.div
                      key={meal.id}
                      layout
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
                        isDeleting ? 'bg-red-50' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start gap-3">
                        {editMode && (
                          <input
                            type="checkbox"
                            checked={selectedForDeletion.includes(meal.id)}
                            onChange={() => toggleMealForDeletion(meal.id)}
                            className="w-5 h-5 mt-1 text-primary-600 cursor-pointer"
                          />
                        )}
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{meal.title}</h3>
                          {meal.description && (
                            <p className="text-gray-600 text-sm mt-1">{meal.description}</p>
                          )}
                          {meal.pickCount > 0 && (
                            <p className="text-xs text-gray-400 mt-2">
                              Selected {meal.pickCount} time{meal.pickCount !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                        {!editMode && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditMeal(meal)}
                              className="text-gray-400 hover:text-primary-500"
                              title="Edit meal"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => confirmDeleteSingleMeal(meal)}
                              className="text-gray-400 hover:text-red-500"
                              title="Archive meal"
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

        {/* Create Session Button */}
        {meals.length > 0 && (
          <section className="mb-12">
            <button
              onClick={openCreateSession}
              className="btn btn-success w-full py-4 text-lg"
            >
              Create New Session
            </button>
          </section>
        )}

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
                        {session.mealCount} meals · {session.participantCount} participants
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

      {/* Add Meal Modal */}
      {showAddMeal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="card w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Add New Meal</h3>
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
                  placeholder="e.g., Tacos"
                  required
                  autoFocus
                />
              </div>
              <div>
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
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddMeal(false)}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Add Meal
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
            <h3 className="text-xl font-bold mb-4">Edit Meal</h3>
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
                  placeholder="e.g., Tacos"
                  required
                  autoFocus
                />
              </div>
              <div>
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
              </div>
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
            <p className="text-gray-600 text-sm mb-4">
              Select meals to include in this session:
            </p>

            {meals.length > 30 && (
              <div className="bg-yellow-50 text-yellow-700 px-3 py-2 rounded text-sm mb-4">
                With {meals.length} meals, sessions may take longer to complete.
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {meals.map((meal) => (
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
                Create ({selectedMealIds.length} meals)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title={mealToDelete ? 'Delete Meal?' : `Delete ${selectedForDeletion.length} Meal${selectedForDeletion.length !== 1 ? 's' : ''}?`}
        message={
          mealToDelete
            ? `Are you sure you want to delete "${mealToDelete.title}"?`
            : `Are you sure you want to delete the following meals?\n\n${meals
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
