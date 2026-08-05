import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { quickSessionApi, SessionMode } from '../api/client';
import { TAKEOUT_CATEGORY_SUGGESTIONS } from '../constants/takeoutCategories';

interface MealInput {
  id: string;
  title: string;
}

export default function QuickSession() {
  const navigate = useNavigate();
  const [creatorName, setCreatorName] = useState('');
  const [mode, setMode] = useState<SessionMode>('takeout');
  const [drafts, setDrafts] = useState<Record<SessionMode, MealInput[]>>({
    home: [{ id: crypto.randomUUID(), title: '' }],
    takeout: [{ id: crypto.randomUUID(), title: '' }],
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const mealInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const meals = drafts[mode];

  const updateCurrentDraft = (
    updater: (current: MealInput[]) => MealInput[]
  ) => {
    setDrafts((current) => ({
      ...current,
      [mode]: updater(current[mode]),
    }));
  };

  const addMeal = () => {
    const newMeal = { id: crypto.randomUUID(), title: '' };
    updateCurrentDraft((current) => [...current, newMeal]);
    // Focus the new input after render
    setTimeout(() => {
      mealInputRefs.current.get(newMeal.id)?.focus();
    }, 0);
  };

  const removeMeal = (id: string) => {
    if (meals.length > 1) {
      updateCurrentDraft((current) => current.filter(m => m.id !== id));
    }
  };

  const updateMeal = (id: string, value: string) => {
    updateCurrentDraft((current) =>
      current.map(m => m.id === id ? { ...m, title: value } : m)
    );
  };

  const addSuggestedCategory = (title: string) => {
    if (meals.some((meal) => meal.title.trim().toLowerCase() === title.toLowerCase())) {
      return;
    }

    const emptyMeal = meals.find((meal) => !meal.title.trim());
    if (emptyMeal) {
      updateMeal(emptyMeal.id, title);
      return;
    }

    updateCurrentDraft((current) => [
      ...current,
      { id: crypto.randomUUID(), title },
    ]);
  };

  const handleMealKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, mealId: string, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentMeal = meals.find(m => m.id === mealId);
      if (currentMeal?.title.trim()) {
        // If there's a next meal, focus it; otherwise add a new one
        if (index < meals.length - 1) {
          const nextMeal = meals[index + 1];
          mealInputRefs.current.get(nextMeal.id)?.focus();
        } else {
          addMeal();
        }
      }
    }
  };

  const handleCreateSession = async () => {
    setError('');

    if (!creatorName.trim()) {
      setError('Please enter your name');
      return;
    }

    const validMeals = meals.filter(m => m.title.trim());
    if (validMeals.length === 0) {
      setError(`Please add at least one ${mode === 'home' ? 'meal' : 'food category'}`);
      return;
    }

    const uniqueTitles = new Set(
      validMeals.map((meal) => meal.title.trim().toLowerCase())
    );
    if (uniqueTitles.size !== validMeals.length) {
      setError('Option names must be unique');
      return;
    }

    setLoading(true);

    try {
      const response = await quickSessionApi.create(
        creatorName.trim(),
        validMeals.map(m => ({
          title: m.title.trim(),
          description: undefined,
        })),
        mode
      );

      // Store session info in the format SwipeSession expects
      sessionStorage.setItem(
        `session_${response.session.id}`,
        JSON.stringify({
          participantId: response.participantId,
          displayName: creatorName.trim(),
          mode: response.session.mode,
          meals: response.meals,
        })
      );
      sessionStorage.setItem('sessionId', response.session.id);
      sessionStorage.setItem('participantId', response.participantId);
      sessionStorage.setItem('inviteCode', response.session.inviteCode);
      sessionStorage.setItem('sessionMode', response.session.mode);
      if (response.creatorToken) {
        sessionStorage.setItem('creatorToken', response.creatorToken);
      }

      // Navigate to share page so creator can share the link
      navigate(`/session/${response.session.id}/share`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">MealMatch</h1>
          <p className="text-gray-600">
            Start a quick vote for takeout or a meal at home
          </p>
        </div>

        {error ? (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
            {error}
          </div>
        ) : null}

        <div className="space-y-6">
          <div>
            <span className="block text-sm font-medium text-gray-700 mb-2">What are you deciding?</span>
            <div className="grid grid-cols-2 gap-2 bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setMode('takeout')}
                className={`px-4 py-3 rounded-md font-medium ${
                  mode === 'takeout' ? 'bg-white shadow-sm text-orange-700' : 'text-gray-600'
                }`}
              >
                Order out
              </button>
              <button
                type="button"
                onClick={() => setMode('home')}
                className={`px-4 py-3 rounded-md font-medium ${
                  mode === 'home' ? 'bg-white shadow-sm text-orange-700' : 'text-gray-600'
                }`}
              >
                Cook at home
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              id="name"
              type="text"
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && creatorName.trim()) {
                  e.preventDefault();
                  mealInputRefs.current.get(meals[0].id)?.focus();
                }
              }}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {mode === 'home' ? 'Meal Options' : 'Food Categories'}
            </label>
            {mode === 'takeout' && (
              <div className="flex flex-wrap gap-2 mb-4">
                {TAKEOUT_CATEGORY_SUGGESTIONS.map((suggestion) => {
                  const selected = meals.some(
                    (meal) => meal.title.trim().toLowerCase() === suggestion.toLowerCase()
                  );
                  return (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => addSuggestedCategory(suggestion)}
                      className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
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
            )}
            <div className="space-y-3">
              {meals.map((meal, index) => (
                <div key={meal.id} className="flex gap-2">
                  <input
                    ref={(el) => {
                      if (el) mealInputRefs.current.set(meal.id, el);
                      else mealInputRefs.current.delete(meal.id);
                    }}
                    type="text"
                    value={meal.title}
                    onChange={(e) => updateMeal(meal.id, e.target.value)}
                    onKeyDown={(e) => handleMealKeyDown(e, meal.id, index)}
                    placeholder={`Option ${index + 1}`}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  {meals.length > 1 ? (
                    <button
                      onClick={() => removeMeal(meal.id)}
                      className="px-3 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-xl"
                      aria-label="Remove option"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <button
              onClick={addMeal}
              className="mt-3 text-orange-600 hover:text-orange-700 font-medium text-sm"
            >
              + Add another option
            </button>
          </div>

          <button
            onClick={handleCreateSession}
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-semibold py-4 rounded-lg transition-colors"
          >
            {loading ? 'Creating...' : 'Create Session'}
          </button>

          <div className="text-center">
            <button
              onClick={() => navigate('/login')}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Already have an account? <span className="underline">Sign in</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
