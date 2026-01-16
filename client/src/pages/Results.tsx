import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { participantApi, ResultsResponse, MatchResult, mealsApi } from '../api/client';
import { useAuth } from '../hooks/useAuth';

interface Participant {
  id: string;
  displayName: string;
  submitted: boolean;
}

export function Results() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreator, setIsCreator] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [savingMeals, setSavingMeals] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const pollTimeoutRef = useRef<number | null>(null);

  // Check if user is the creator
  useEffect(() => {
    const creatorToken = sessionStorage.getItem('creatorToken');
    const storedSessionId = sessionStorage.getItem('sessionId');
    if (creatorToken && storedSessionId === sessionId) {
      setIsCreator(true);
    }
  }, [sessionId]);

  const loadResults = useCallback(async () => {
    if (!sessionId) return;

    try {
      const data = await participantApi.getResults(sessionId, !!user);
      setResults(data);

      // If still waiting, poll for session status (includes participants)
      if (data.status === 'waiting') {
        const statusData = await participantApi.getSessionStatus(sessionId);
        setParticipants(statusData.participants);
        pollTimeoutRef.current = window.setTimeout(loadResults, 3000);
      } else {
        // Session closed, show save prompt for creator
        if (isCreator) {
          setShowSavePrompt(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [sessionId, user, isCreator]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  const handleCloseSession = async () => {
    if (!sessionId) return;

    const creatorToken = sessionStorage.getItem('creatorToken');
    if (!creatorToken) return;

    setClosing(true);
    try {
      await participantApi.closeSession(sessionId, creatorToken);
      setShowCloseConfirm(false);
      // Reload results to get the final data
      await loadResults();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close session');
    } finally {
      setClosing(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const handleSaveMeals = async () => {
    if (!results?.results) return;

    setSavingMeals(true);
    try {
      // Save all meals to the user's library
      for (const result of results.results) {
        await mealsApi.create(result.title, result.description || undefined);
      }

      // Clear creator token
      sessionStorage.removeItem('creatorToken');
      sessionStorage.removeItem('sessionId');
      setShowSavePrompt(false);

      // Navigate to dashboard
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save meals');
    } finally {
      setSavingMeals(false);
    }
  };

  const handleDismissPrompt = () => {
    sessionStorage.removeItem('creatorToken');
    sessionStorage.removeItem('sessionId');
    setShowSavePrompt(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card text-center max-w-md">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold mb-2">Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!results || results.status === 'waiting') {
    const inviteCode = sessionStorage.getItem('inviteCode');
    const shareUrl = inviteCode ? `${window.location.origin}/join/${inviteCode}` : null;

    const handleCopyLink = async () => {
      if (!shareUrl) return;
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch {
        const input = document.createElement('input');
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
    };

    const submittedCount = participants.filter(p => p.submitted).length;

    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card text-center max-w-md w-full">
          <div className="animate-pulse text-6xl mb-4">⏳</div>
          <h1 className="text-2xl font-bold mb-2">Waiting for Votes</h1>
          <p className="text-gray-600">
            {submittedCount} of {participants.length} people have finished voting
          </p>

          {/* Participant list */}
          {participants.length > 0 ? (
            <div className="mt-6 text-left">
              <div className="space-y-2">
                {participants.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                  >
                    <span className="font-medium">{p.displayName}</span>
                    {p.submitted ? (
                      <span className="text-green-600 text-sm flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Done
                      </span>
                    ) : (
                      <span className="text-orange-500 text-sm flex items-center gap-1">
                        <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="4" />
                        </svg>
                        Swiping...
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* End Session button for creator */}
          {isCreator ? (
            <div className="mt-6">
              <button
                onClick={() => setShowCloseConfirm(true)}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                End Session & Show Results
              </button>
            </div>
          ) : (
            <div className="mt-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto" />
            </div>
          )}

          {shareUrl ? (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-500 mb-3">Invite more people to vote:</p>
              <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-2">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="flex-1 bg-transparent text-sm text-gray-700 outline-none truncate"
                />
                <button
                  onClick={handleCopyLink}
                  className="text-primary-600 hover:text-primary-700 font-medium text-sm whitespace-nowrap"
                >
                  Copy
                </button>
              </div>
            </div>
          ) : null}

          {/* Close confirmation modal */}
          {showCloseConfirm ? (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-left">
                <h2 className="text-xl font-bold mb-2">End Session?</h2>
                <p className="text-gray-600 mb-6">
                  This will close voting and show results to everyone.
                  {participants.length - submittedCount > 0 && (
                    <span className="block mt-2 text-orange-600">
                      {participants.length - submittedCount} {participants.length - submittedCount === 1 ? 'person hasn\'t' : 'people haven\'t'} finished voting yet.
                    </span>
                  )}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCloseConfirm(false)}
                    disabled={closing}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCloseSession}
                    disabled={closing}
                    className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                  >
                    {closing ? 'Closing...' : 'End Session'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const unanimousResults = results.results?.filter((r) => r.isUnanimous) || [];
  const otherResults = results.results?.filter((r) => !r.isUnanimous) || [];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-600">Results</h1>
          <p className="text-gray-600 mt-2">Here's what everyone thought!</p>
        </div>

        {/* Selected meal banner */}
        {results.selectedMeal && (
          <div className="card bg-green-50 border-2 border-green-500 mb-8">
            <div className="text-center">
              <span className="text-4xl">🎉</span>
              <h2 className="text-xl font-bold mt-2 text-green-700">Tonight's Pick:</h2>
              <p className="text-2xl font-bold mt-1">{results.selectedMeal.title}</p>
              {results.selectedMeal.description && (
                <p className="text-gray-600 mt-1">{results.selectedMeal.description}</p>
              )}
            </div>
          </div>
        )}

        {/* Unanimous matches */}
        {unanimousResults.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="text-2xl">🏆</span>
              Unanimous Matches
            </h2>
            <div className="space-y-3">
              {unanimousResults.map((result) => (
                <ResultCard key={result.mealId} result={result} />
              ))}
            </div>
          </section>
        )}

        {/* Other results */}
        {otherResults.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold mb-4">All Results</h2>
            <div className="space-y-3">
              {otherResults.map((result) => (
                <ResultCard key={result.mealId} result={result} />
              ))}
            </div>
          </section>
        )}

        {/* Save meals prompt for anonymous creators */}
        {isCreator && showSavePrompt && !user ? (
          <div className="card bg-orange-50 border-2 border-orange-500 mt-8">
            <div className="text-center">
              <h3 className="font-bold text-lg">Save these meals?</h3>
              <p className="text-gray-600 mt-1 mb-4">
                Create an account to save these meals to your library and host more sessions!
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleDismissPrompt}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  No thanks
                </button>
                <Link
                  to="/register"
                  className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
                >
                  Create Account
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        {/* Save meals for logged-in creators */}
        {isCreator && showSavePrompt && user ? (
          <div className="card bg-green-50 border-2 border-green-500 mt-8">
            <div className="text-center">
              <h3 className="font-bold text-lg">Save these meals to your library?</h3>
              <p className="text-gray-600 mt-1 mb-4">
                Add all meals from this session to your permanent collection.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleDismissPrompt}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  No thanks
                </button>
                <button
                  onClick={handleSaveMeals}
                  disabled={savingMeals}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                >
                  {savingMeals ? 'Saving...' : 'Save Meals'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Account prompt for non-logged in users */}
        {!user && !isCreator ? (
          <div className="card bg-primary-50 border border-primary-200 mt-8">
            <div className="text-center">
              <h3 className="font-bold text-lg">Want to host your own sessions?</h3>
              <p className="text-gray-600 mt-1 mb-4">
                Create an account to build your meal collection and invite friends.
              </p>
              <Link to="/register" className="btn btn-primary">
                Create Account
              </Link>
            </div>
          </div>
        ) : null}

        {/* Back to dashboard for logged in users */}
        {user && results.isHost && (
          <div className="text-center mt-8">
            <Link to="/dashboard" className="btn btn-primary">
              Back to Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

interface ResultCardProps {
  result: MatchResult;
}

function ResultCard({ result }: ResultCardProps) {
  const getBarColor = () => {
    if (result.percentage >= 75) return 'bg-green-500';
    if (result.percentage >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div
      className={`card ${
        result.isUnanimous ? 'ring-2 ring-yellow-400 bg-yellow-50' : ''
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold text-lg">{result.title}</h3>
          {result.description && (
            <p className="text-gray-600 text-sm mt-1">{result.description}</p>
          )}
        </div>
        {result.isUnanimous && (
          <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded font-medium">
            Everyone agreed!
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">
            {result.yesCount}/{result.totalVotes} said yes
          </span>
          <span className="font-medium">{result.percentage}%</span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${getBarColor()}`}
            style={{ width: `${result.percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
