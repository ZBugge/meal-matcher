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
  initialSwipes?: Record<string, boolean>;
  initialIndex?: number;
  onSwipe: (mealId: string, vote: boolean, allSwipes: Record<string, boolean>) => void;
  onComplete: (swipes: Record<string, boolean>) => void;
}

export function SwipeDeck({
  meals,
  initialSwipes = {},
  initialIndex = 0,
  onSwipe,
  onComplete,
}: SwipeDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [swipes, setSwipes] = useState<Record<string, boolean>>(initialSwipes);
  const [showReview, setShowReview] = useState(false);

  const currentMeal = meals[currentIndex];
  const isComplete = currentIndex >= meals.length;

  useEffect(() => {
    if (isComplete && !showReview) {
      setShowReview(true);
    }
  }, [isComplete, showReview]);

  const handleSwipe = (direction: 'left' | 'right') => {
    if (!currentMeal) return;

    const vote = direction === 'right';
    const newSwipes = { ...swipes, [currentMeal.id]: vote };

    setSwipes(newSwipes);
    onSwipe(currentMeal.id, vote, newSwipes);
    setCurrentIndex((prev) => prev + 1);
  };

  const handleReviewChange = (mealId: string) => {
    const newSwipes = { ...swipes, [mealId]: !swipes[mealId] };
    setSwipes(newSwipes);
    onSwipe(mealId, newSwipes[mealId], newSwipes);
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
        <h2 className="text-2xl font-bold text-center mb-6">Review Your Choices</h2>
        <p className="text-gray-600 text-center mb-6">
          Tap any meal to change your vote
        </p>

        <div className="space-y-3 mb-8">
          {meals.map((meal) => (
            <button
              key={meal.id}
              onClick={() => handleReviewChange(meal.id)}
              className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                swipes[meal.id]
                  ? 'border-green-500 bg-green-50'
                  : 'border-red-300 bg-red-50'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">{meal.title}</p>
                  {meal.description && (
                    <p className="text-sm text-gray-500 mt-1">{meal.description}</p>
                  )}
                </div>
                <span
                  className={`text-sm font-medium px-3 py-1 rounded ${
                    swipes[meal.id]
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {swipes[meal.id] ? 'YUM' : 'NOPE'}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={handleBackToSwipe} className="btn btn-secondary flex-1">
            Back
          </button>
          <button onClick={handleSubmit} className="btn btn-success flex-1 py-4 text-lg">
            Submit Votes
          </button>
        </div>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
