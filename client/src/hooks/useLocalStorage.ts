import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const readValue = (): T => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return initialValue;
    }
  };
  const [entry, setEntry] = useState(() => ({ key, value: readValue() }));

  // Hydrate a new key before children commit; never copy the old key's value to it.
  const current = entry.key === key ? entry : { key, value: readValue() };
  if (entry.key !== key) setEntry(current);

  useEffect(() => {
    if (entry.key !== key) return;
    try {
      if (entry.value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(entry.value));
    } catch (error) {
      console.error('Error writing to localStorage:', error);
    }
  }, [key, entry]);

  const setStoredValue = (value: T | ((previous: T) => T)) => {
    setEntry(previous => ({
      key,
      value: typeof value === 'function'
        ? (value as (previous: T) => T)(previous.key === key ? previous.value : current.value)
        : value,
    }));
  };
  return [current.value, setStoredValue] as const;
}

// Swipe progress types
export interface SwipeProgress {
  sessionId: string;
  participantId: string;
  participantName: string;
  swipes: Record<string, number>; // mealId -> vote (0=no, 1=yes, 2=maybe)
  currentIndex: number;
  savedAt: number;
}

export function useSwipeProgress(sessionId: string, participantName: string, participantId?: string) {
  const key = `swipe_session_${sessionId}_${participantName}`;
  const [progress, setProgress] = useLocalStorage<SwipeProgress | null>(key, null);

  const saveProgress = (
    participantId: string,
    swipes: Record<string, number>,
    currentIndex: number
  ) => {
    setProgress({
      sessionId,
      participantId,
      participantName,
      swipes,
      currentIndex,
      savedAt: Date.now(),
    });
  };

  const clearProgress = () => {
    setProgress(null);
    window.localStorage.removeItem(key);
  };

  const ownProgress = progress?.sessionId === sessionId &&
    progress.participantName === participantName &&
    (!participantId || progress.participantId === participantId) ? progress : null;

  return { progress: ownProgress, saveProgress, clearProgress };
}
