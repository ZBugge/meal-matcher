import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { sessionsApi, SessionDetails, MatchResult } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';

export function SessionView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const loadSession = async () => {
    if (!sessionId) return;

    try {
      const data = await sessionsApi.get(sessionId);
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!session) return;

    const inviteUrl = `${window.location.origin}/join/${session.inviteCode}`;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseSession = async () => {
    if (!sessionId || !session) return;

    // Check if there are unsubmitted participants
    const unsubmittedCount = session.participants.filter((p) => !p.submitted).length;

    if (unsubmittedCount > 0) {
      // Show confirmation modal if there are unsubmitted participants
      setShowConfirmModal(true);
    } else {
      // Close immediately if all participants have submitted
      await closeSession();
    }
  };

  const closeSession = async () => {
    if (!sessionId) return;

    try {
      await sessionsApi.close(sessionId);
      setShowConfirmModal(false);
      loadSession(); // Reload to get results
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close session');
    }
  };

  const handleSelectMeal = async (mealId: string) => {
    if (!sessionId) return;

    try {
      await sessionsApi.selectMeal(sessionId, mealId);
      loadSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select meal');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card text-center">
          <p className="text-red-600 mb-4">{error || 'Session not found'}</p>
          <Link to="/dashboard" className="btn btn-primary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const submittedCount = session.participants.filter((p) => p.submitted).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/dashboard" className="text-primary-600 hover:underline flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Dashboard
          </Link>
          <span
            className={`px-3 py-1 rounded text-sm font-medium ${
              session.status === 'open'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {session.status}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Invite Section */}
        <section className="card mb-6">
          <h2 className="text-xl font-bold mb-4">Invite Link</h2>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/join/${session.inviteCode}`}
              className="input flex-1 bg-gray-50"
            />
            <button onClick={handleCopyLink} className="btn btn-primary">
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <a
              href={`/join/${session.inviteCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary whitespace-nowrap"
            >
              Join & Swipe
            </a>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Share this link with your group to let them vote on meals
          </p>
        </section>

        {/* Status Section */}
        {session.status === 'open' && (
          <section className="card mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">Session Status</h2>
                <p className="text-gray-600 mt-1">
                  {submittedCount} of {session.participants.length} participants have voted
                </p>
              </div>
              <button
                onClick={handleCloseSession}
                className="btn btn-danger"
              >
                Close Session
              </button>
            </div>

            {session.participants.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h3 className="font-medium mb-2">Participants:</h3>
                <div className="flex flex-wrap gap-2">
                  {session.participants.map((p) => (
                    <span
                      key={p.id}
                      className={`px-3 py-1 rounded-full text-sm ${
                        p.submitted
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {p.displayName}
                      {p.submitted ? ' ✓' : ' ...'}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {session.participants.length === 0 && (
              <p className="text-gray-500 mt-4">Waiting for participants to join...</p>
            )}
          </section>
        )}

        {/* Results Section */}
        {session.status === 'closed' && session.results && (
          <section className="card mb-6">
            <h2 className="text-xl font-bold mb-4">Results</h2>

            {session.selectedMealId && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <p className="text-green-700 font-medium">
                  Selected:{' '}
                  {session.results.find((r) => r.mealId === session.selectedMealId)?.title}
                </p>
              </div>
            )}

            <div className="space-y-4">
              {session.results.map((result) => (
                <ResultCard
                  key={result.mealId}
                  result={result}
                  isSelected={result.mealId === session.selectedMealId}
                  onSelect={() => handleSelectMeal(result.mealId)}
                  showVoters
                  canSelect={!session.selectedMealId}
                />
              ))}
            </div>
          </section>
        )}

        {/* Meals in Session */}
        <section className="card">
          <h2 className="text-xl font-bold mb-4">Meals in Session ({session.meals.length})</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {session.meals.map((meal) => (
              <div key={meal.id} className="border rounded-lg p-3">
                <p className="font-medium">{meal.title}</p>
                {meal.description && (
                  <p className="text-sm text-gray-500 mt-1">{meal.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

      <ConfirmModal
        isOpen={showConfirmModal}
        title="End Session Early?"
        message={`${session.participants.filter((p) => !p.submitted).length} participant(s) haven't finished voting. End session anyway?`}
        confirmText="End Session"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={closeSession}
        onCancel={() => setShowConfirmModal(false)}
      />
    </div>
  );
}

interface ResultCardProps {
  result: MatchResult;
  isSelected: boolean;
  onSelect: () => void;
  showVoters?: boolean;
  canSelect?: boolean;
}

function ResultCard({ result, isSelected, onSelect, showVoters, canSelect }: ResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border rounded-lg p-4 ${
        isSelected ? 'border-green-500 bg-green-50' : ''
      } ${result.isUnanimous ? 'ring-2 ring-yellow-400' : ''}`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{result.title}</h3>
            {result.isUnanimous && (
              <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded">
                Unanimous!
              </span>
            )}
          </div>
          {result.description && (
            <p className="text-gray-600 text-sm mt-1">{result.description}</p>
          )}

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600">
                {result.yesCount}/{result.totalVotes} agreed
              </span>
              <span className="font-medium">{result.percentage}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  result.percentage >= 75
                    ? 'bg-green-500'
                    : result.percentage >= 50
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${result.percentage}%` }}
              />
            </div>
          </div>
        </div>

        {canSelect && !isSelected && (
          <button onClick={onSelect} className="btn btn-success ml-4">
            Select
          </button>
        )}
      </div>

      {/* Voter breakdown (host only) */}
      {showVoters && result.voters && result.voters.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {expanded ? 'Hide' : 'Show'} votes
          </button>
          {expanded && (
            <div className="flex flex-wrap gap-2 mt-2">
              {result.voters.map((voter, i) => (
                <span
                  key={i}
                  className={`text-xs px-2 py-1 rounded ${
                    voter.vote
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {voter.name}: {voter.vote ? 'Yes' : 'No'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
