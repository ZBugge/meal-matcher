import { useWeekPath } from '../hooks/useWeekPath';
import { AddToWeek } from '../components/AddToWeek';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ModalSheet } from '../components/ModalSheet';
import { FamilyHeader } from '../components/FamilyHeader';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import {
  authApi,
  mealsApi,
  sessionsApi,
  Meal,
  LibraryExportData,
  LibraryImportPreview,
  RecipeIngredient,
  Session,
  SessionMode,
} from '../api/client';
import ConfirmModal from '../components/ConfirmModal';
import RecipeFields from '../components/RecipeFields';
import RecipePasteImport from '../components/RecipePasteImport';
import RecipeViewer from '../components/RecipeViewer';
import NotionConnection from '../components/NotionConnection';
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

function MetadataFields({ minutes, effort, onMinutes, onEffort }: { minutes: string; effort: string; onMinutes: (value: string) => void; onEffort: (value: string) => void }) {
  return <div className="grid sm:grid-cols-2 gap-4">
    <label className="block text-sm font-medium">Total time (minutes)<input className="input mt-1" type="number" min="1" max="1440" step="1" value={minutes} onChange={event => onMinutes(event.target.value)} /></label>
    <label className="block text-sm font-medium">Effort<select aria-label="Effort" className="input mt-1" value={effort} onChange={event => onEffort(event.target.value)}><option value="">Not set</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="involved">Involved</option></select></label>
  </div>;
}
function RecipeMetadata({ meal }: { meal: Meal }) {
  return meal.type === 'meal' && (meal.totalMinutes != null || meal.effort) ? <span className="block text-sm text-muted mt-1">{[meal.totalMinutes != null ? `${meal.totalMinutes} min` : '', meal.effort ? `${meal.effort[0].toUpperCase()}${meal.effort.slice(1)} effort` : ''].filter(Boolean).join(' · ')}</span> : null;
}

export function Dashboard() {
  const { user } = useAuth();
  const recipesPage = useLocation().pathname === '/recipes';
  const [showManage, setShowManage] = useState(false);
  const [detailMeal, setDetailMeal] = useState<Meal | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const beginSave = () => { if (savingRef.current) return false; savingRef.current = true; setSaving(true); setError(''); return true; };
  const endSave = () => { savingRef.current = false; setSaving(false); };
  const navigate = useNavigate();
  const weekPath = useWeekPath();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeMode, setActiveMode] = useState<SessionMode>('home');
  const [recipeSource, setRecipeSource] = useState<'regular' | 'notion'>('regular');
  const [libraryCollapsed, setLibraryCollapsed] = useState(true);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [search, setSearch] = useState('');
  const [maxMinutes, setMaxMinutes] = useState('');
  const [effortFilter, setEffortFilter] = useState('');
  const [newMinutes, setNewMinutes] = useState('');
  const [newEffort, setNewEffort] = useState('');
  const [editMinutes, setEditMinutes] = useState('');
  const [editEffort, setEditEffort] = useState('');

  // Modal states
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [newMealTitle, setNewMealTitle] = useState('');
  const [newMealDescription, setNewMealDescription] = useState('');
  const [newMealInstructions, setNewMealInstructions] = useState('');
  const [newMealIngredients, setNewMealIngredients] = useState<RecipeIngredient[]>([]);
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
  const [editInstructions, setEditInstructions] = useState('');
  const [editIngredients, setEditIngredients] = useState<RecipeIngredient[]>([]);
  const [viewingRecipe, setViewingRecipe] = useState<Meal | null>(null);
  const [loadingRecipeId, setLoadingRecipeId] = useState<string | null>(null);
  const [notingMeal, setNotingMeal] = useState<Meal | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [showLibraryImport, setShowLibraryImport] = useState(false);
  const [libraryImportData, setLibraryImportData] = useState<LibraryExportData | null>(null);
  const [libraryImportPreview, setLibraryImportPreview] = useState<LibraryImportPreview | null>(null);
  const [libraryTransferLoading, setLibraryTransferLoading] = useState(false);

  // Animation states
  const [deletingMealIds, setDeletingMealIds] = useState<string[]>([]);

  const activeType = activeMode === 'home' ? 'meal' : 'category';
  const activeMeals = meals.filter((meal) => meal.type === activeType && (!editMode || meal.source !== 'notion') && (!recipesPage || activeMode !== 'home' || (recipeSource === 'notion' ? meal.source === 'notion' : meal.source !== 'notion')));
  const visibleMeals = activeMeals.filter(meal => `${meal.title} ${meal.description || ''}`.toLowerCase().includes(search.trim().toLowerCase())
    && (activeMode !== 'home' || ((!maxMinutes || (meal.totalMinutes != null && meal.totalMinutes <= Number(maxMinutes))) && (!effortFilter || meal.effort === effortFilter))));
  const sessionType = sessionMode === 'home' ? 'meal' : 'category';
  const sessionMeals = meals.filter((meal) => meal.type === sessionType);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setTakeoutOnboardingDismissed(Boolean(user?.takeoutOnboardingDismissed));
  }, [user?.takeoutOnboardingDismissed]);

  const loadData = async () => {
    setError('');
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
    if (!beginSave()) return false;
    try {
      await authApi.updatePreferences(true);
      setTakeoutOnboardingDismissed(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save your takeout setup preference');
      return false;
    } finally { endSave(); }
  };

  const handleAddMeal = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!beginSave()) return;
    try {
      const hasRecipe = Boolean(newMealInstructions.trim()) || newMealIngredients.length > 0 || Boolean(newMinutes || newEffort);
      const meal = activeMode === 'home'
        ? hasRecipe
          ? await mealsApi.create(
              newMealTitle.trim(),
              newMealDescription || undefined,
              'meal',
              { instructions: newMealInstructions, ingredients: newMealIngredients, ...(newMinutes ? { totalMinutes: Number(newMinutes) } : {}), ...(newEffort ? { effort: newEffort as Meal['effort'] } : {}) }
            )
          : await mealsApi.create(newMealTitle.trim(), newMealDescription || undefined)
        : await mealsApi.create(newMealTitle.trim(), undefined, 'category');
      setMeals((current) => [meal, ...current]);
      setNewMealTitle('');
      setNewMealDescription('');
      setNewMealInstructions('');
      setNewMealIngredients([]);
      setNewMinutes('');
      setNewEffort('');
      setShowAddMeal(false);
      if (activeMode === 'takeout') {
        setTakeoutOnboardingDismissed(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to add ${activeMode === 'home' ? 'meal' : 'category'}`);
    } finally { endSave(); }
  };

  const openAddMeal = () => {
    setError('');
    setNewMealTitle('');
    setNewMealDescription('');
    setNewMealInstructions('');
    setNewMealIngredients([]);
    setNewMinutes('');
    setNewEffort('');
    setShowAddMeal(true);
  };

  const closeAddMeal = () => {
    setNewMealTitle('');
    setNewMealDescription('');
    setNewMealInstructions('');
    setNewMealIngredients([]);
    setNewMinutes('');
    setNewEffort('');
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
    setError('');
    setSelectedStarterCategories([]);
    setShowTakeoutOnboarding(true);
  };

  const handleAddStarterCategories = async () => {
    if (selectedStarterCategories.length === 0) {
      setError('Choose at least one category to add');
      return;
    }

    if (!beginSave()) return;
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
    } finally { endSave(); }
  };

  const handleAddOwnCategory = async () => {
    if (await markTakeoutOnboardingComplete()) {
      openAddMeal();
    }
  };

  const openEditMeal = (meal: Meal) => {
    setError('');
    setEditingMeal(meal);
    setEditTitle(meal.title);
    setEditMinutes(meal.totalMinutes == null ? '' : String(meal.totalMinutes));
    setEditEffort(meal.effort ?? '');
    setEditDescription(meal.description || '');
    setEditInstructions(meal.instructions || '');
    setEditIngredients(meal.ingredients?.map((row) => ({ ...row })) || []);
    setShowEditMeal(true);
  };

  const openNotes = (meal: Meal) => {
    setError('');
    setNotingMeal(meal);
    setNotesDraft(meal.notes || '');
  };

  const closeNotes = () => {
    setNotingMeal(null);
    setNotesDraft('');
  };

  const openRecipe = async (mealId: string, loadedMeal?: Meal) => {
    if (loadedMeal?.type === 'meal') {
      setViewingRecipe(loadedMeal);
      return;
    }

    setLoadingRecipeId(mealId);
    try {
      const meal = await mealsApi.get(mealId);
      if (meal.type === 'meal') setViewingRecipe(meal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recipe');
    } finally {
      setLoadingRecipeId(null);
    }
  };

  const handleUpdateMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMeal) return;

    if (!beginSave()) return;
    try {
      const hasLoadedRecipe = editingMeal.instructions !== undefined
        || editingMeal.ingredients !== undefined;
      const hasRecipeDraft = Boolean(editInstructions.trim()) || editIngredients.length > 0;
      const updatedMeal = await mealsApi.update(editingMeal.id, {
        title: editTitle,
        ...(editingMeal.type === 'meal'
          ? { description: editDescription || undefined,
              ...(editingMeal.totalMinutes !== undefined || editMinutes ? { totalMinutes: editMinutes ? Number(editMinutes) : null } : {}),
              ...(editingMeal.effort !== undefined || editEffort ? { effort: (editEffort || null) as Meal['effort'] } : {}),
            }
          : {}),
        ...(editingMeal.type === 'meal' && (hasLoadedRecipe || hasRecipeDraft)
          ? {
              instructions: editInstructions || null,
              ingredients: editIngredients,
            }
          : {}),
      });
      setMeals((current) => current.map((m) =>
        m.id === editingMeal.id
          ? {
              ...m,
              ...updatedMeal,
              lastSelectedAt: m.lastSelectedAt,
            }
          : m
      ));
      setShowEditMeal(false);
      setDetailMeal(null);
      setEditingMeal(null);
      setEditTitle('');
      setEditDescription('');
      setEditInstructions('');
      setEditIngredients([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update meal');
    } finally { endSave(); }
  };

  const handleSaveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notingMeal) return;

    if (!beginSave()) return;
    try {
      const updatedMeal = await mealsApi.update(notingMeal.id, { notes: notesDraft });
      setMeals((current) => current.map((meal) =>
        meal.id === notingMeal.id
          ? {
              ...meal,
              ...updatedMeal,
              lastSelectedAt: meal.lastSelectedAt,
            }
          : meal
      ));
      closeNotes();
      setDetailMeal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notes');
    } finally { endSave(); }
  };

  const handleExportLibrary = async () => {
    if (!beginSave()) return;
    setLibraryTransferLoading(true);
    try {
      const data = await mealsApi.exportLibrary();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `mealmatch-library-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export library');
    } finally {
      endSave();
      setLibraryTransferLoading(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!beginSave()) return;
    setLibraryTransferLoading(true);
    try {
      const data = JSON.parse(await file.text()) as LibraryExportData;
      const preview = await mealsApi.previewImport(data);
      setLibraryImportData(data);
      setLibraryImportPreview(preview);
    } catch (err) {
      setLibraryImportData(null);
      setLibraryImportPreview(null);
      setError(err instanceof Error ? err.message : 'Failed to read import file');
    } finally {
      endSave();
      setLibraryTransferLoading(false);
      event.target.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!libraryImportData) return;
    if (!beginSave()) return;
    setLibraryTransferLoading(true);
    try {
      const result = await mealsApi.importLibrary(libraryImportData);
      setLibraryImportPreview(result);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import library');
    } finally {
      endSave();
      setLibraryTransferLoading(false);
    }
  };

  const closeLibraryImport = () => {
    setShowLibraryImport(false);
    setLibraryImportData(null);
    setLibraryImportPreview(null);
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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete meal');
      setDeletingMealIds([]);
      return false;
    }
  };

  const confirmDeleteSingleMeal = (meal: Meal) => {
    setMealToDelete(meal);
    setShowDeleteConfirm(true);
  };

  const handleConfirmSingleDelete = async () => {
    if (!mealToDelete) return;

    if (!beginSave()) return;
    try { if (await handleDeleteMeal(mealToDelete.id)) { setShowDeleteConfirm(false); setMealToDelete(null); setDetailMeal(null); } } finally { endSave(); }
  };

  const handleBulkDelete = async () => {
    if (!beginSave()) return;
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
    } finally { endSave(); }
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

    if (!beginSave()) return;
    try {
      const session = await sessionsApi.create(selectedMealIds, sessionMode);
      navigate(weekPath(`/session/${session.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally { endSave(); }
  };


  const openCreateSession = () => {
    setError('');
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

    if (!beginSave()) return;
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
    } finally { endSave(); }
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

    if (!beginSave()) return;
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
      endSave();
      setAddingSuggestion(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p role="status" className="text-muted">Opening your kitchen…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      {!recipesPage && <FamilyHeader />}
      <main className="family-page">
        <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Your family kitchen</p><h1 className="page-title mt-1">{recipesPage ? 'Recipes' : 'Choose together'}</h1></div>{recipesPage && (activeMode === 'takeout' || recipeSource === 'regular') && <button className="btn btn-primary" onClick={() => { setError(''); openAddMeal(); }}>{activeMode === 'home' ? 'Add recipe' : 'Add Category'}</button>}</div>
        {error && !showAddMeal && !showEditMeal && !notingMeal && !showCreateSession && !showTakeoutOnboarding && !showLibraryImport && !showDeleteConfirm && !showManage && !detailMeal && (
          <div role="alert" className="bg-red-50 text-red-800 px-4 py-3 rounded-lg mb-6">
            {error}
            <button className="btn btn-secondary ml-2" onClick={() => { setLoading(true); loadData(); }}>Retry loading</button>
            <button onClick={() => setError('')} aria-label="Dismiss error" className="ml-2 min-w-12 min-h-12 font-bold">
              ×
            </button>
          </div>
        )}

        {/* Saved options */}
        {!recipesPage && <>
        <section className="mb-8" aria-label="Choose meals together">
          <p className="mb-3 text-gray-600">Choose together, then add a few favorites to your week.</p>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => navigate(weekPath('/quick'))} className="btn btn-secondary py-4 text-lg">Quick Session</button>
            {meals.length > 0 && <button onClick={openCreateSession} className="btn btn-success py-4 text-lg">Create Session</button>}
          </div>
          {meals.length === 0 && <p className="text-sm text-gray-600 mt-2">Add saved options to create a session from your library, or use Quick Session to start immediately.</p>}
        </section>
        </>}
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

          {recipesPage && activeMode === 'home' && <>
            <div role="tablist" aria-label="Recipe source" className="flex flex-wrap gap-2 mb-5">
              {(['regular', 'notion'] as const).map(source => <button key={source} type="button" role="tab" aria-selected={recipeSource === source} className={`btn ${recipeSource === source ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setRecipeSource(source); setEditMode(false); setSelectedForDeletion([]); setSearch(''); setMaxMinutes(''); setEffortFilter(''); }}>{source === 'notion' ? 'Notion recipes' : 'Regular recipes'}</button>)}
            </div>
            {recipeSource === 'notion' && <NotionConnection onRefreshed={loadData} />}
          </>}

          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              {!recipesPage && <h2 className="text-2xl font-bold">
                {activeMode === 'home' ? 'My Meals' : 'My Food Categories'}
              </h2>}
              {recipesPage && (activeMode === 'takeout' || recipeSource === 'regular') && <button className="min-h-12 px-3 text-sm font-semibold text-primary-700 underline" onClick={() => { setError(''); setShowManage(true); }}>Manage library</button>}
              {!recipesPage && <button type="button" aria-expanded={!libraryCollapsed} aria-controls="saved-library" onClick={() => setLibraryCollapsed(value => !value)} className="btn btn-secondary min-h-12 px-4">
                {libraryCollapsed ? 'Show library' : 'Hide library'}
              </button>}
              {!recipesPage && activeMeals.length > 0 && (
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
            {!editMode && !recipesPage && (
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={handleExportLibrary}
                  disabled={libraryTransferLoading}
                  className="btn btn-secondary"
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => setShowLibraryImport(true)}
                  className="btn btn-secondary"
                >
                  Import
                </button>
                <button onClick={openAddMeal} className="btn btn-primary">
                  {activeMode === 'home' ? 'Add Meal' : 'Add Category'}
                </button>
              </div>
            )}
          </div>

          {recipesPage && editMode && <div className="flex flex-wrap gap-3 mb-4"><button className="btn btn-secondary" onClick={toggleEditMode}>Done</button><button className="btn btn-danger" disabled={!selectedForDeletion.length} onClick={confirmBulkDelete}>Delete Selected ({selectedForDeletion.length})</button></div>}
          <div id="saved-library" hidden={!recipesPage && libraryCollapsed}>
          <label className="mb-4 block text-sm font-medium text-gray-600">
            Search your {activeMode === 'home' ? 'recipes' : 'categories'}
            <input type="search" className="input mt-2" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a favorite…" />
          </label>
          {activeMode === 'home' && (!recipesPage || recipeSource === 'regular') && <div className="flex flex-wrap gap-3 items-end mb-4">
            <label className="text-sm font-medium">Maximum total time<select aria-label="Maximum total time" className="input mt-1" value={maxMinutes} onChange={event => setMaxMinutes(event.target.value)}><option value="">Any time</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></label>
            <label className="text-sm font-medium">Filter by effort<select aria-label="Filter by effort" className="input mt-1" value={effortFilter} onChange={event => setEffortFilter(event.target.value)}><option value="">Any effort</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="involved">Involved</option></select></label>
            {(search || maxMinutes || effortFilter) && <button className="btn btn-secondary" onClick={() => { setSearch(''); setMaxMinutes(''); setEffortFilter(''); }}>Clear filters</button>}
          </div>}
          {activeMeals.length > 0 && visibleMeals.length === 0 && <p className="py-4 text-gray-500">No matching options. Try another search.</p>}
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
                    ? recipesPage && recipeSource === 'notion' ? 'Your refreshed Notion recipes will appear here.' : 'No meals yet. Add some to get started!'
                    : 'No takeout categories yet. Add your favorites to get started!'}
                </p>
                {(!recipesPage || activeMode !== 'home' || recipeSource === 'regular') && <button onClick={openAddMeal} className="btn btn-primary">
                  {activeMode === 'home' ? 'Add Your First Meal' : 'Add Your First Category'}
                </button>}
              </div>
            )
          ) : (
            recipesPage ? <ul className="divide-y divide-stone-200">{visibleMeals.map(meal => <li key={meal.id} className="flex gap-3 items-center py-2">{editMode && <label className="min-h-12 min-w-12 flex items-center justify-center"><input type="checkbox" checked={selectedForDeletion.includes(meal.id)} onChange={() => toggleMealForDeletion(meal.id)} aria-label={`Select ${meal.title} for deletion`} /></label>}<button className="flex-1 min-w-0 min-h-16 text-left py-3 flex items-center justify-between gap-3" onClick={() => { setError(''); setDetailMeal(meal); }} disabled={editMode}><span className="min-w-0"><span className="dinner-title text-xl block">{meal.title}</span><RecipeMetadata meal={meal} /><span className="block text-sm text-muted mt-1">{meal.type === 'category' ? 'Takeout category' : meal.ingredients?.length ? `${meal.ingredients.length} ingredients` : 'Saved family recipe'}</span></span><span aria-hidden="true">→</span></button></li>)}</ul> :
            <div className="grid gap-4 sm:grid-cols-2">
              <AnimatePresence mode="popLayout">
                {visibleMeals.map((meal) => {
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
                          {meal.type === 'meal' && !editMode ? (
                            <button
                              type="button"
                              onClick={() => openRecipe(meal.id, meal)}
                              className="text-left text-lg font-semibold text-primary-700 hover:underline"
                            >
                              {meal.title}
                            </button>
                          ) : (
                            <h3 className="font-semibold text-lg">{meal.title}</h3>
                          )}
                          <RecipeMetadata meal={meal} />
                          {meal.description && (
                            <p className="text-gray-600 text-sm mt-1">{meal.description}</p>
                          )}
                          {meal.type === 'meal' && !editMode && <AddToWeek mealId={meal.id} title={meal.title} />}
                          {meal.type === 'meal' && !editMode && <button type="button" onClick={() => navigate(weekPath(`/cook/${meal.id}`))} className="mt-2 text-sm font-medium text-primary-700 underline">Cook this recipe</button>}
                          {meal.type === 'meal'
                            && (meal.instructions || (meal.ingredients?.length ?? 0) > 0) && (
                            <p className="text-xs text-primary-600 mt-2">
                              Recipe · {meal.ingredients?.length ?? 0} ingredient{
                                (meal.ingredients?.length ?? 0) === 1 ? '' : 's'
                              }
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-2">
                            {meal.pickCount > 0 && (
                              <>Selected {meal.pickCount} time{meal.pickCount !== 1 ? 's' : ''} · </>
                            )}
                            {formatLastSelectedAt(meal.lastSelectedAt)}
                          </p>
                        </div>
                        {!editMode && meal.source === 'notion' && meal.notionUrl && <a href={meal.notionUrl} target="_blank" rel="noreferrer" className="min-h-12 underline text-primary-700">Edit in Notion</a>}
                        {!editMode && meal.source !== 'notion' && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openNotes(meal)}
                              className="min-w-12 min-h-12 text-sm text-muted hover:text-primary-600"
                              title={`View notes for ${meal.title}`}
                            >
                              Notes
                            </button>
                            <button
                              onClick={() => openEditMeal(meal)}
                              className="icon-button text-muted hover:text-primary-600"
                              title={meal.type === 'category' ? 'Edit category' : 'Edit meal'}
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => confirmDeleteSingleMeal(meal)}
                              className="icon-button text-muted hover:text-red-700"
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
          </div>
        </section>

        {/* Sessions Section */}
        {!recipesPage && <section>
          <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-2xl font-bold">Recent Sessions</h2>
            <button type="button" aria-expanded={!historyCollapsed} aria-controls="session-history" onClick={() => setHistoryCollapsed(value => !value)} className="btn btn-secondary min-h-12 px-4">{historyCollapsed ? 'Show history' : 'Hide history'}</button>
          </div>
          <div id="session-history" hidden={historyCollapsed}>

          {sessions.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-500">No sessions yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="card cursor-pointer hover:border-primary-300 transition-colors"
                  role="link" tabIndex={0}
                  onKeyDown={event => { if (event.target === event.currentTarget && event.key === 'Enter') navigate(weekPath(`/session/${session.id}`)); }}
                  onClick={() => navigate(weekPath(`/session/${session.id}`))}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      {session.status === 'closed' && session.selectedMeal ? (
                        <>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-gray-900">
                              Winner:{' '}
                              {session.selectedMeal.type === 'meal' ? (
                                <button
                                  type="button"
                                  disabled={loadingRecipeId === session.selectedMeal.id}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openRecipe(session.selectedMeal!.id);
                                  }}
                                  className="text-primary-700 hover:underline disabled:text-gray-400"
                                >
                                  {loadingRecipeId === session.selectedMeal.id
                                    ? 'Loading recipe...'
                                    : session.selectedMeal.title}
                                </button>
                              ) : (
                                session.selectedMeal.title
                              )}
                            </h3>
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary-50 text-primary-700">
                              {session.mode === 'takeout' ? 'Order out' : 'Cook at home'}
                            </span>
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                              {session.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {session.mealCount} options · {session.participantCount} participants
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            Invite code: <span className="font-mono font-medium">{session.inviteCode}</span>
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-lg">{session.inviteCode}</span>
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary-50 text-primary-700">
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
                        </>
                      )}
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
          </div>
        </section>}
      </main>

      {showManage && <ModalSheet title="Manage library" busy={saving || libraryTransferLoading} onClose={() => setShowManage(false)}>{error && !showLibraryImport && <p role="alert" className="text-red-800">{error}</p>}<p className="text-muted">Import or export your private recipes and categories, or select options to delete.</p><button className="menu-action" disabled={libraryTransferLoading} onClick={handleExportLibrary}>Export</button><button className="menu-action" disabled={libraryTransferLoading} onClick={() => { setError(''); setShowLibraryImport(true); }}>Import</button><button className="menu-action" disabled={libraryTransferLoading} onClick={() => { setEditMode(true); setSelectedForDeletion([]); setShowManage(false); }}>Select options to delete</button></ModalSheet>}
      {detailMeal && <ModalSheet title={detailMeal.title} onClose={() => setDetailMeal(null)} busy={saving}>
        {error && !showEditMeal && !notingMeal && !viewingRecipe && !showDeleteConfirm && <p role="alert" className="text-red-800">{error}</p>}
        {detailMeal.description && <p className="text-muted">{detailMeal.description}</p>}
        {detailMeal.type === 'meal' && <><button className="menu-action" onClick={() => openRecipe(detailMeal.id, detailMeal)}>Read recipe</button><AddToWeek mealId={detailMeal.id} title={detailMeal.title} /><button className="menu-action" onClick={() => navigate(weekPath(`/cook/${detailMeal.id}`))}>Cook this recipe</button></>}
        {detailMeal.source === 'notion' ? <a href={detailMeal.notionUrl} target="_blank" rel="noreferrer" className="menu-action">Edit in Notion</a> : <>
          <button className="menu-action" onClick={() => openEditMeal(detailMeal)}>Edit {detailMeal.type === 'meal' ? 'recipe' : 'category'}</button>
          <button className="menu-action" onClick={() => openNotes(detailMeal)}>Private notes</button>
          <button className="menu-action text-red-700" onClick={() => confirmDeleteSingleMeal(detailMeal)}>Delete {detailMeal.type === 'meal' ? 'recipe' : 'category'}</button>
        </>}
        <p className="text-sm text-muted">{formatLastSelectedAt(detailMeal.lastSelectedAt)} · Selected {detailMeal.pickCount} times</p>
      </ModalSheet>}

      {viewingRecipe && (
        <RecipeViewer meal={viewingRecipe} onClose={() => setViewingRecipe(null)} />
      )}

      {/* Takeout onboarding modal */}
      {showTakeoutOnboarding && (
        <ModalSheet title="Start with popular categories" onClose={() => setShowTakeoutOnboarding(false)} busy={saving || libraryTransferLoading}>
          {error && <p role="alert" className="rounded-xl bg-red-50 text-red-800 p-3">{error}</p>}
          <fieldset disabled={saving || libraryTransferLoading} className="min-w-0">
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
                          ? 'bg-primary-100 border-primary-300 text-primary-800'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-primary-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleStarterCategory(suggestion)}
                        className="accent-primary-500"
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

          </fieldset>
        </ModalSheet>
      )}

      {/* Library Import Modal */}
      {showLibraryImport && (
        <ModalSheet title="Import library" onClose={closeLibraryImport} busy={saving || libraryTransferLoading}>
          {error && <p role="alert" className="rounded-xl bg-red-50 text-red-800 p-3">{error}</p>}
          <fieldset disabled={saving || libraryTransferLoading} className="min-w-0">
            <p className="text-sm text-gray-600 mb-4">
              Choose a MealMatch JSON export to preview new options and duplicates before saving.
            </p>
            <label className="btn btn-secondary inline-block cursor-pointer">
              Choose JSON file
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
                className="sr-only"
                aria-label="Library JSON file"
              />
            </label>

            {libraryTransferLoading && <p className="mt-4 text-sm text-gray-500">Checking file...</p>}

            {libraryImportPreview && (
              <div className="mt-5 space-y-3" aria-live="polite">
                {libraryImportPreview.imported > 0 ? (
                  <p className="rounded-lg bg-green-50 px-3 py-2 text-green-700">
                    Imported {libraryImportPreview.imported} option{
                      libraryImportPreview.imported === 1 ? '' : 's'
                    }.
                  </p>
                ) : (
                  <p className="font-medium">
                    {libraryImportPreview.ready} option{
                      libraryImportPreview.ready === 1 ? '' : 's'
                    } ready to import
                  </p>
                )}
                {libraryImportPreview.duplicates.length > 0 && (
                  <div>
                    <h4 className="font-medium">Duplicates skipped</h4>
                    <ul className="list-disc pl-5 text-sm text-gray-600">
                      {libraryImportPreview.duplicates.map((duplicate) => (
                        <li key={duplicate}>{duplicate}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {libraryImportPreview.invalid.length > 0 && (
                  <div>
                    <h4 className="font-medium">Invalid entries skipped</h4>
                    <ul className="list-disc pl-5 text-sm text-red-600">
                      {libraryImportPreview.invalid.map((entry) => (
                        <li key={`${entry.index}-${entry.error}`}>
                          Option {entry.index + 1}: {entry.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button type="button" onClick={closeLibraryImport} className="btn btn-secondary flex-1">
                {libraryImportPreview?.imported ? 'Done' : 'Cancel'}
              </button>
              {libraryImportPreview && libraryImportPreview.imported === 0 && (
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={libraryTransferLoading || libraryImportPreview.ready === 0}
                  className="btn btn-primary flex-1"
                >
                  Import {libraryImportPreview.ready}
                </button>
              )}
            </div>

          </fieldset>
        </ModalSheet>
      )}

      {/* Add Meal Modal */}
      {showAddMeal && (
        <ModalSheet title={activeMode === 'home' ? 'Add New Meal' : 'Add Food Category'} onClose={closeAddMeal} busy={saving || libraryTransferLoading} fullHeight={activeMode === 'home'} footer={<>
          {error && <p role="alert" className="rounded-xl bg-red-50 text-red-800 p-3 mb-3">{error}</p>}
          <div className="flex gap-3"><button type="button" disabled={saving || libraryTransferLoading} onClick={closeAddMeal} className="btn btn-secondary flex-1">Cancel</button><button type="submit" form="add-library-option" disabled={saving || libraryTransferLoading} className="btn btn-primary flex-1">{activeMode === 'home' ? 'Add Meal' : 'Add Category'}</button></div>
        </>}>
          <fieldset disabled={saving || libraryTransferLoading} className="min-w-0">
            <form id="add-library-option" onSubmit={handleAddMeal} className="space-y-4">
              {activeMode === 'home' && (
                <RecipePasteImport
                  onParsed={(recipe) => {
                    setNewMealTitle(recipe.title);
                    setNewMealDescription(recipe.description || '');
                    setNewMealInstructions(recipe.instructions || '');
                    setNewMealIngredients(recipe.ingredients);
                  }}
                />
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  aria-label="Title"
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
                  aria-label="Description (optional)"
                  value={newMealDescription}
                  onChange={(e) => setNewMealDescription(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="e.g., Beef tacos with all the fixings"
                />
              </div>}
              {activeMode === 'home' && <MetadataFields minutes={newMinutes} effort={newEffort} onMinutes={setNewMinutes} onEffort={setNewEffort} />}
              {activeMode === 'home' && (
                <RecipeFields
                  instructions={newMealInstructions}
                  ingredients={newMealIngredients}
                  onInstructionsChange={setNewMealInstructions}
                  onIngredientsChange={setNewMealIngredients}
                />
              )}
            </form>

          </fieldset>
        </ModalSheet>
      )}

      {/* Edit Meal Modal */}
      {showEditMeal && editingMeal && (
        <ModalSheet title={editingMeal?.type === 'category' ? 'Edit Category' : 'Edit Meal'} onClose={() => setShowEditMeal(false)} busy={saving || libraryTransferLoading} fullHeight={editingMeal.type === 'meal'} footer={<>
          {error && <p role="alert" className="rounded-xl bg-red-50 text-red-800 p-3 mb-3">{error}</p>}
          <div className="flex gap-3"><button type="button" disabled={saving || libraryTransferLoading} onClick={() => setShowEditMeal(false)} className="btn btn-secondary flex-1">Cancel</button><button type="submit" form="edit-library-option" disabled={saving || libraryTransferLoading} className="btn btn-primary flex-1">Save</button></div>
        </>}>
          <fieldset disabled={saving || libraryTransferLoading} className="min-w-0">
            <form id="edit-library-option" onSubmit={handleUpdateMeal} className="space-y-4">
              {editingMeal.type === 'meal' && (
                <RecipePasteImport
                  onParsed={(recipe) => {
                    setEditTitle(recipe.title);
                    setEditDescription(recipe.description || '');
                    setEditInstructions(recipe.instructions || '');
                    setEditIngredients(recipe.ingredients);
                  }}
                />
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  aria-label="Title"
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
                  aria-label="Description (optional)"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="e.g., Beef tacos with all the fixings"
                />
              </div>}
              {editingMeal.type === 'meal' && <MetadataFields minutes={editMinutes} effort={editEffort} onMinutes={setEditMinutes} onEffort={setEditEffort} />}
              {editingMeal.type === 'meal' && (
                <RecipeFields
                  instructions={editInstructions}
                  ingredients={editIngredients}
                  onInstructionsChange={setEditInstructions}
                  onIngredientsChange={setEditIngredients}
                />
              )}
            </form>

          </fieldset>
        </ModalSheet>
      )}

      {/* Private Notes Modal */}
      {notingMeal && (
        <ModalSheet title={`Notes for ${notingMeal?.title}`} onClose={closeNotes} busy={saving || libraryTransferLoading}>
          {error && <p role="alert" className="rounded-xl bg-red-50 text-red-800 p-3">{error}</p>}
          <fieldset disabled={saving || libraryTransferLoading} className="min-w-0">
            <p className="text-sm text-gray-600 mb-4">
              These notes are private to your library and are not shared with session participants.
            </p>
            <form onSubmit={handleSaveNotes} className="space-y-4">
              <div>
                <label htmlFor="private-notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Private notes
                </label>
                <textarea
                  id="private-notes"
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                  className="input"
                  rows={6}
                  placeholder="e.g., Ask for the spicy sauce on the side"
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={closeNotes} className="btn btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  Save notes
                </button>
              </div>
            </form>

          </fieldset>
        </ModalSheet>
      )}

      {/* Create Session Modal */}
      {showCreateSession && (
        <ModalSheet title="Create Session" onClose={() => setShowCreateSession(false)} busy={saving || libraryTransferLoading}>
          {error && <p role="alert" className="rounded-xl bg-red-50 text-red-800 p-3">{error}</p>}
          <fieldset disabled={saving || libraryTransferLoading} className="min-w-0">

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
              <details className="mb-4">
                <summary className="min-h-12 flex items-center cursor-pointer text-sm font-semibold text-primary-700">Quick picks (optional)</summary>
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
                            ? 'bg-primary-100 border-primary-300 text-primary-800'
                            : 'bg-white border-gray-300 text-gray-700 hover:border-primary-400'
                        }`}
                      >
                        {selected ? `✓ ${suggestion}` : suggestion}
                      </button>
                    );
                  })}
                </div>
              </details>
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
                    className="w-4 h-4 shrink-0 text-primary-600"
                  />
                  <span className="font-medium flex-1 min-w-0 break-words">{meal.title}</span>
                  {meal.source === 'notion' && <span className="shrink-0 rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700">Notion</span>}
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

          </fieldset>
        </ModalSheet>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        busy={saving}
        error={error}
        isDanger
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
