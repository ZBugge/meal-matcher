import { useLayoutEffect, useRef, useState } from 'react';
import { SwipeDeck } from './SwipeDeck';

export interface VotingChooserProps {
  meals: { id: string; title: string; description: string | null }[];
  initialSwipes?: Record<string, number>;
  initialIndex?: number;
  onProgressChange?: (swipes: Record<string, number>, currentIndex: number) => void;
  onComplete: (swipes: Record<string, number>) => void;
  editMode?: boolean;
  canRetry?: boolean;
  initialMode?: 'list' | 'swipe';
  onModeChange?: (mode: 'list' | 'swipe') => void;
}

export function VotingChooser({
  meals, initialSwipes = {}, initialIndex, onProgressChange, onComplete,
  editMode = false, canRetry = false, initialMode = 'list', onModeChange,
}: VotingChooserProps) {
  const startingIndex = initialIndex ?? (editMode ? meals.length : 0);
  const [choices, setChoices] = useState(initialSwipes);
  const [cursor, setCursor] = useState(startingIndex);
  const [mode, setMode] = useState(initialMode);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [swipeStartsComplete, setSwipeStartsComplete] = useState(startingIndex >= meals.length);
  const listRef = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const yesCount = meals.filter((meal) => choices[meal.id] === 1).length;
  const maybeCount = meals.filter((meal) => choices[meal.id] === 2).length;

  useLayoutEffect(() => {
    if (mode === 'list' && listRef.current) listRef.current.scrollTop = listScroll.current;
  }, [mode]);

  const updateProgress = (nextChoices: Record<string, number>, nextCursor: number) => {
    setChoices(nextChoices);
    setCursor(nextCursor);
    onProgressChange?.(nextChoices, nextCursor);
  };

  const switchMode = (nextMode: 'list' | 'swipe') => {
    if (mode === nextMode) return;
    if (mode === 'list') listScroll.current = listRef.current?.scrollTop ?? 0;
    if (nextMode === 'swipe') setSwipeStartsComplete(cursor >= meals.length);
    setMode(nextMode);
    onModeChange?.(nextMode);
  };

  const submit = (votes: Record<string, number>) => {
    const ballot = Object.fromEntries(meals.map((meal) => [meal.id, votes[meal.id] ?? 0]));
    updateProgress(ballot, cursor);
    onComplete(ballot);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex gap-2 mb-4" role="group" aria-label="Voting view">
        {(['list', 'swipe'] as const).map((view) => (
          <button key={view} type="button" aria-pressed={mode === view}
            className={`btn flex-1 min-h-11 ${mode === view ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => switchMode(view)}>
            {view === 'list' ? 'List' : 'Swipe'}
          </button>
        ))}
      </div>

      <div hidden={mode !== 'list'}>
        <p className="text-sm text-gray-600 mb-3">Select every option you would enjoy. Unselected options count as No. Kept Maybe votes stay Maybe.</p>
        <div ref={listRef} className="max-h-[55dvh] overflow-y-auto overscroll-contain rounded-lg border border-gray-200"
          aria-label="Meal choices" tabIndex={0}
          onScroll={(event) => { listScroll.current = event.currentTarget.scrollTop; }}>
          {meals.map((meal) => (
            <div key={meal.id} className="border-b border-gray-200 last:border-b-0 bg-white px-3 py-1">
              <div className="flex items-center gap-2">
                <label className="flex flex-1 min-w-0 min-h-11 items-center gap-3 cursor-pointer py-2">
                  <input type="checkbox" checked={choices[meal.id] === 1}
                    aria-describedby={choices[meal.id] === 2 ? `maybe-${meal.id}` : undefined}
                    className="h-5 w-5 shrink-0 accent-green-700"
                    onChange={(event) => updateProgress({ ...choices, [meal.id]: event.target.checked ? 1 : 0 }, cursor)} />
                  <span className="font-medium break-words">{meal.title}</span>
                </label>
                {choices[meal.id] === 2 && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span id={`maybe-${meal.id}`} className="text-sm font-medium text-amber-800">Maybe</span>
                    <button type="button" className="min-h-11 px-2 text-sm underline text-gray-700"
                      aria-label={`Remove Maybe for ${meal.title}`}
                      onClick={() => updateProgress({ ...choices, [meal.id]: 0 }, cursor)}>Remove</button>
                  </div>
                )}
                {meal.description && (
                  <button type="button" className="min-h-11 shrink-0 px-2 text-sm text-primary-700 underline"
                    aria-label={`Details for ${meal.title}`} aria-expanded={!!expanded[meal.id]}
                    aria-controls={`description-${meal.id}`}
                    onClick={() => setExpanded({ ...expanded, [meal.id]: !expanded[meal.id] })}>Details</button>
                )}
              </div>
              {meal.description && (
                <p id={`description-${meal.id}`} hidden={!expanded[meal.id]}
                  className="pb-3 text-sm text-gray-600 whitespace-pre-wrap break-words">{meal.description}</p>
              )}
            </div>
          ))}
        </div>
        <div className="voting-submit sticky bottom-0 rounded-xl bg-white p-3 border border-gray-200 mt-3">
          <p className="text-sm text-gray-700 mb-2" aria-live="polite">
            {yesCount} selected Yes{maybeCount > 0 ? ` · ${maybeCount} Maybe` : ''}
          </p>
          <button type="button" className="btn btn-success w-full min-h-11" onClick={() => submit(choices)}>
            {canRetry ? 'Retry Submission' : 'Submit Votes'}
          </button>
        </div>
      </div>

      {mode === 'swipe' && (
        <div className="relative">
          <SwipeDeck meals={meals} initialSwipes={choices} initialIndex={cursor}
            onSwipe={() => {}} onProgressChange={updateProgress} onComplete={submit}
            editMode={editMode || swipeStartsComplete || canRetry} canRetry={canRetry} />
        </div>
      )}
    </div>
  );
}
