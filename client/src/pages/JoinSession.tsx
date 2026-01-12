import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { participantApi } from '../api/client';

export function JoinSession() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [sessionClosed, setSessionClosed] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);

  useEffect(() => {
    checkSession();
  }, [inviteCode]);

  const checkSession = async () => {
    if (!inviteCode) return;

    try {
      const session = await participantApi.getSession(inviteCode);
      setParticipantCount(session.participantCount);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('ended')) {
          setSessionClosed(true);
        } else {
          setError(err.message);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode || !displayName.trim()) return;

    setJoining(true);
    setError('');

    try {
      const response = await participantApi.joinSession(inviteCode, displayName.trim());

      // Store participant info in session storage
      sessionStorage.setItem(
        `session_${response.sessionId}`,
        JSON.stringify({
          participantId: response.participantId,
          displayName: displayName.trim(),
          meals: response.meals,
        })
      );

      navigate(`/swipe/${response.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session');
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (sessionClosed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card text-center max-w-md">
          <div className="text-6xl mb-4">⏰</div>
          <h1 className="text-2xl font-bold mb-2">Session Ended</h1>
          <p className="text-gray-600">
            This voting session has already been closed by the host.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card text-center max-w-md">
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold mb-2">Session Not Found</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="card">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-primary-600">MealMatch</h1>
            <p className="text-gray-600 mt-2">Join the meal voting session</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <span className="bg-primary-100 text-primary-700 font-mono font-bold px-4 py-2 rounded-lg text-xl">
                {inviteCode}
              </span>
            </div>
            {participantCount > 0 && (
              <p className="text-sm text-gray-500 mt-2">
                {participantCount} {participantCount === 1 ? 'person has' : 'people have'} joined
              </p>
            )}
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Your Name
              </label>
              <input
                id="name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input"
                placeholder="Enter your name"
                required
                autoFocus
                maxLength={30}
              />
            </div>

            <button
              type="submit"
              disabled={joining || !displayName.trim()}
              className="btn btn-primary w-full py-3"
            >
              {joining ? 'Joining...' : 'Start Swiping'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
