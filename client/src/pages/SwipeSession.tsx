import { useWeekPath } from '../hooks/useWeekPath';
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { participantApi } from '../api/client';
import type { SessionMode } from '../api/client';
import { VotingChooser } from '../components/VotingChooser';
import { useSwipeProgress } from '../hooks/useLocalStorage';

interface SessionData {
  participantId: string;
  displayName: string;
  mode?: SessionMode;
  submittedSwipes?: Record<string, number>;
  meals: Array<{
    id: string;
    title: string;
    description: string | null;
    sessionMealId: string;
  }>;
}

export function SwipeSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <SwipeSessionContent key={sessionId} sessionId={sessionId} />;
}

function SwipeSessionContent({ sessionId }: { sessionId: string | undefined }) {
  const navigate = useNavigate();
  const weekPath = useWeekPath();
  const location = useLocation();
  const editMode = location.state?.editMode || false;
  const [sessionData, setSessionData] = useState<SessionData | null>(() => {
    try {
      const stored = sessionId && sessionStorage.getItem(`session_${sessionId}`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(sessionData ? '' : 'Session data not found. Please rejoin the session.');
  const [sessionClosed, setSessionClosed] = useState(false);

  // Session context is hydrated before the progress key and deck are initialized.
  const displayName = sessionData?.displayName || '';
  const { progress, saveProgress, clearProgress } = useSwipeProgress(
    sessionId || '',
    displayName,
    sessionData?.participantId
  );

  const votingModeKey = `voting_mode_${sessionId}_${sessionData?.participantId || ''}`;
  const [votingMode, setVotingMode] = useState<'list' | 'swipe'>(() => {
    try { return sessionStorage.getItem(votingModeKey) === 'swipe' ? 'swipe' : 'list'; }
    catch { return 'list'; }
  });
  const handleModeChange = (mode: 'list' | 'swipe') => {
    setVotingMode(mode);
    try { sessionStorage.setItem(votingModeKey, mode); } catch { /* Keep this visit usable. */ }
  };

  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (!submitted) return;
    const timeout = window.setTimeout(() => navigate(weekPath(`/results/${sessionId}`)), 1500);
    return () => window.clearTimeout(timeout);
  }, [submitted, sessionId, navigate, weekPath]);

  const handleProgress = (allSwipes: Record<string, number>, currentIndex: number) => {
    if (!sessionData || !sessionId) return;
    saveProgress(sessionData.participantId, allSwipes, currentIndex);
  };

  const handleComplete = async (swipes: Record<string, number>) => {
    if (!sessionId || !sessionData || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      // Convert swipes to API format
      const swipeArray = Object.entries(swipes).map(([mealId, vote]) => ({
        mealId,
        vote,
      }));

      await participantApi.submitSwipes(sessionId, sessionData.participantId, swipeArray);

      if (!active.current) return;
      const updatedSession = { ...sessionData, submittedSwipes: { ...swipes } };
      sessionStorage.setItem(`session_${sessionId}`, JSON.stringify(updatedSession));
      setSessionData(updatedSession);

      // Keep the last accepted ballot in this tab's context; clear only the draft.
      clearProgress();

      setSubmitted(true);

    } catch (err) {
      if (!active.current) return;
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

  // Get initial state from progress if available
  const initialSwipes = progress?.swipes || (editMode ? sessionData.submittedSwipes : undefined) || {};
  const initialIndex = progress?.currentIndex ?? (editMode ? sessionData.meals.length : 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-200 to-gray-300 py-6 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold text-primary-600">MealMatch</h1>
          <p className="text-gray-600 text-sm mt-1">
            {editMode
              ? `Update your choices, ${sessionData.displayName}!`
              : `Hey ${sessionData.displayName}! Choose the ${
                  sessionData.mode === 'takeout' ? 'food categories' : 'meals'
                } you'd like.`}
          </p>

        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-6 text-center">
            {error}
          </div>
        )}

        {/* Swipe deck */}
        {submitting && <p role="status" className="text-center mb-4">Submitting your votes...</p>}
        <fieldset disabled={submitting} className={submitting ? 'pointer-events-none opacity-50' : ''}>
        <VotingChooser
          meals={sessionData.meals}
          initialSwipes={initialSwipes}
          initialIndex={initialIndex}
          initialMode={votingMode}
          onModeChange={handleModeChange}
          onProgressChange={handleProgress}
          canRetry={!!error}
          onComplete={handleComplete}
          editMode={editMode}
        />
        </fieldset>
      </div>
    </div>
  );
}
