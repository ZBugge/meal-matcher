import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { participantApi } from '../api/client';
import { SwipeDeck } from '../components/SwipeDeck';
import { useSwipeProgress } from '../hooks/useLocalStorage';

interface SessionData {
  participantId: string;
  displayName: string;
  meals: Array<{
    id: string;
    title: string;
    description: string | null;
    sessionMealId: string;
  }>;
}

export function SwipeSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [sessionClosed, setSessionClosed] = useState(false);

  // Initialize progress hook with placeholder values first
  const displayName = sessionData?.displayName || '';
  const { progress, saveProgress, clearProgress } = useSwipeProgress(
    sessionId || '',
    displayName
  );

  useEffect(() => {
    loadSessionData();
  }, [sessionId]);

  const loadSessionData = () => {
    if (!sessionId) return;

    // Try to get session data from storage
    const stored = sessionStorage.getItem(`session_${sessionId}`);
    if (stored) {
      setSessionData(JSON.parse(stored));
    } else {
      // No session data - redirect to join
      setError('Session data not found. Please rejoin the session.');
    }
  };

  const handleSwipe = (
    _mealId: string,
    _vote: boolean,
    allSwipes: Record<string, boolean>
  ) => {
    if (!sessionData || !sessionId) return;

    // Calculate current index from swipes
    const currentIndex = Object.keys(allSwipes).length;

    // Save progress to local storage
    saveProgress(sessionData.participantId, allSwipes, currentIndex);
  };

  const handleComplete = async (swipes: Record<string, boolean>) => {
    if (!sessionId || !sessionData) return;

    setSubmitting(true);
    setError('');

    try {
      // Convert swipes to API format
      const swipeArray = Object.entries(swipes).map(([mealId, vote]) => ({
        mealId,
        vote,
      }));

      await participantApi.submitSwipes(sessionId, sessionData.participantId, swipeArray);

      // Clear local storage progress
      clearProgress();

      // Clear session storage
      sessionStorage.removeItem(`session_${sessionId}`);

      setSubmitted(true);

      // Navigate to results after a brief moment
      setTimeout(() => {
        navigate(`/results/${sessionId}`);
      }, 1500);
    } catch (err) {
      // Check if the session was closed
      if (err && typeof err === 'object' && 'sessionClosed' in err && err.sessionClosed) {
        // Clear storage
        clearProgress();
        sessionStorage.removeItem(`session_${sessionId}`);
        setSessionClosed(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to submit votes');
      }
      setSubmitting(false);
    }
  };

  if (sessionClosed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card text-center max-w-md">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold mb-2">Session Ended</h1>
          <p className="text-gray-600 mb-4">This session has been ended.</p>
          <button
            onClick={() => navigate('/')}
            className="btn btn-primary"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (error && !sessionData) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card text-center max-w-md">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold mb-2">Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="btn btn-primary"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card text-center max-w-md">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold mb-2">Votes Submitted!</h1>
          <p className="text-gray-600">Taking you to the results...</p>
        </div>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card text-center max-w-md">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Submitting your votes...</p>
        </div>
      </div>
    );
  }

  // Get initial state from progress if available
  const initialSwipes = progress?.swipes || {};
  const initialIndex = progress?.currentIndex || 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-primary-600">MealMatch</h1>
          <p className="text-gray-600 mt-1">
            Hey {sessionData.displayName}! Swipe right on meals you'd like to eat.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-6 text-center">
            {error}
          </div>
        )}

        {/* Swipe deck */}
        <SwipeDeck
          meals={sessionData.meals}
          initialSwipes={initialSwipes}
          initialIndex={initialIndex}
          onSwipe={handleSwipe}
          onComplete={handleComplete}
        />
      </div>
    </div>
  );
}
