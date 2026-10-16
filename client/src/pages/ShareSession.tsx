import { useWeekPath } from '../hooks/useWeekPath';
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { SessionMode } from '../api/client';

export function ShareSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const weekPath = useWeekPath();
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [mode, setMode] = useState<SessionMode>('home');

  useEffect(() => {
    const code = sessionStorage.getItem('inviteCode');
    if (code) {
      setInviteCode(code);
    }
    const storedMode = sessionStorage.getItem('sessionMode');
    if (storedMode === 'home' || storedMode === 'takeout') {
      setMode(storedMode);
    }
  }, []);

  const shareUrl = `${window.location.origin}/join/${inviteCode}`;

  const handleCopy = async () => {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('Select and copy the invite link above. Clipboard access is unavailable.');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join my MealMatch session!',
          text: 'Help us decide what to eat!',
          url: shareUrl,
        });
      } catch {
        // User cancelled or share failed, fall back to copy
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  const handleContinue = () => {
    navigate(weekPath(`/session/${sessionId}/swipe`));
  };

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-5 sm:p-8 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Voting is ready</h1>
          <p className="text-gray-600">
            Share this {mode === 'takeout' ? 'order-out' : 'cook-at-home'} vote with your group
          </p>
        </div>

        <div className="mb-6">
          <div className="bg-gray-50 rounded-lg p-4 mb-3">
            <p className="text-xs text-gray-500 mb-1">Invite Code</p>
            <p className="text-3xl font-mono font-bold text-primary-600 tracking-wider">{inviteCode}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 flex items-center gap-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              aria-label="Invite link"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 outline-none truncate"
            />
            <button
              onClick={handleCopy}
              className="btn btn-secondary whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {copyError && <p role="alert" className="text-red-800 mb-4">{copyError}</p>}
        <div className="space-y-3">
          <button
            onClick={handleShare}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Link
          </button>

          <button
            onClick={handleContinue}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition-colors"
          >
            Start voting
          </button>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          Others can join anytime before you close the session
        </p>
      </div>
    </div>
  );
}
