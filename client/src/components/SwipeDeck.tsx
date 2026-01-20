import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SwipeCard } from './SwipeCard';

interface Meal {
  id: string;
  title: string;
  description: string | null;
}

interface SwipeDeckProps {
  meals: Meal[];
  initialSwipes?: Record<string, number>;
  initialIndex?: number;
  onSwipe: (mealId: string, vote: number, allSwipes: Record<string, number>) => void;
  onComplete: (swipes: Record<string, number>) => void;
  editMode?: boolean;
}

export function SwipeDeck({
  meals,
  initialSwipes = {},
  initialIndex = 0,
  onSwipe,
  onComplete,
  editMode = false,
}: SwipeDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [swipes, setSwipes] = useState<Record<string, number>>(initialSwipes);
  const [showReview, setShowReview] = useState(editMode || false);

  const currentMeal = meals[currentIndex];
  const isComplete = currentIndex >= meals.length;

  useEffect(() => {
    if (isComplete && !showReview && !editMode) {
      setShowReview(true);
      // Auto-submit when all swipes are done (not in edit mode)
      onComplete(swipes);
    }
  }, [isComplete, showReview, editMode, swipes, onComplete]);

  const handleSwipe = (direction: 'left' | 'right') => {
    if (!currentMeal) return;

    const vote = direction === 'right' ? 1 : 0;
    const newSwipes = { ...swipes, [currentMeal.id]: vote };

    setSwipes(newSwipes);
    onSwipe(currentMeal.id, vote, newSwipes);
    setCurrentIndex((prev) => prev + 1);
  };

  const handleMaybe = () => {
    if (!currentMeal) return;

    const vote = 2;
    const newSwipes = { ...swipes, [currentMeal.id]: vote };

    setSwipes(newSwipes);
    onSwipe(currentMeal.id, vote, newSwipes);
    setCurrentIndex((prev) => prev + 1);
  };

  const handleReviewChange = (mealId: string) => {
    // Only allow changes in edit mode
    if (!editMode) return;

    const currentVote = swipes[mealId] ?? 0;
    const newVote = currentVote === 0 ? 1 : currentVote === 1 ? 2 : 0;
    const newSwipes = { ...swipes, [mealId]: newVote };
    setSwipes(newSwipes);
    onSwipe(mealId, newVote, newSwipes);
  };

  const handleGoBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setShowReview(false);
    }
  };

  const handleBackToSwipe = () => {
    setShowReview(false);
    setCurrentIndex(meals.length - 1);
  };

  const handleSubmit = () => {
    onComplete(swipes);
  };

  // Review screen
  if (showReview) {
    return (
      <div className="w-full max-w-md mx-auto px-4">
        <h2 className="text-2xl font-bold text-center mb-6">
          {editMode ? 'Edit Your Choices' : 'Your Choices'}
        </h2>
        <p className="text-gray-600 text-center mb-6">
          {editMode ? 'Tap any meal to change your vote' : 'Your votes have been submitted'}
        </p>

        <div className="space-y-3 mb-8">
          {meals.map((meal) => {
            const vote = swipes[meal.id] ?? 0;
            const borderColor = vote === 1 ? 'border-green-500 bg-green-50' : vote === 2 ? 'border-yellow-500 bg-yellow-50' : 'border-red-300 bg-red-50';
            const badgeColor = vote === 1 ? 'bg-green-100 text-green-700' : vote === 2 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
            const label = vote === 1 ? 'YUM' : vote === 2 ? 'MAYBE' : 'NOPE';

            return editMode ? (
              <button
                key={meal.id}
                onClick={() => handleReviewChange(meal.id)}
                className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${borderColor}`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{meal.title}</p>
                    {meal.description && (
                      <p className="text-sm text-gray-500 mt-1">{meal.description}</p>
                    )}
                  </div>
                  <span className={`text-sm font-medium px-3 py-1 rounded ${badgeColor}`}>
                    {label}
                  </span>
                </div>
              </button>
            ) : (
              <div
                key={meal.id}
                className={`w-full p-4 rounded-lg border-2 ${borderColor}`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{meal.title}</p>
                    {meal.description && (
                      <p className="text-sm text-gray-500 mt-1">{meal.description}</p>
                    )}
                  </div>
                  <span className={`text-sm font-medium px-3 py-1 rounded ${badgeColor}`}>
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {editMode ? (
          <div className="flex gap-3">
            <button onClick={handleBackToSwipe} className="btn btn-secondary flex-1">
              Back
            </button>
            <button onClick={handleSubmit} className="btn btn-success flex-1 py-4 text-lg">
              Submit Votes
            </button>
          </div>
        ) : (
          <button onClick={() => window.location.href = `/results/${window.location.pathname.split('/')[2]}`} className="btn btn-primary w-full py-4 text-lg">
            View Results
          </button>
        )}
      </div>
    );
  }

  // Swipe interface
  return (
    <div className="w-full">
      {/* Back button */}
      {currentIndex > 0 && (
        <div className="absolute top-4 left-4 z-10">
          <button
            onClick={handleGoBack}
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {currentMeal && (
          <motion.div
            key={currentMeal.id}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SwipeCard
              title={currentMeal.title}
              description={currentMeal.description}
              onSwipe={handleSwipe}
              progress={`${currentIndex + 1} / ${meals.length}`}
            />
            <div className="flex justify-center mt-4">
              <button
                onClick={handleMaybe}
                className="px-6 py-2 rounded-full bg-white shadow-lg border-2 border-yellow-500 text-yellow-600 hover:bg-yellow-50 active:bg-yellow-100 active:scale-95 transition-all font-medium"
              >
                Maybe
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
