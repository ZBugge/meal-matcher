import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  // Get stored value or use initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return initialValue;
    }
  });

  // Update localStorage when value changes
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.error('Error writing to localStorage:', error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue] as const;
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

export function useSwipeProgress(sessionId: string, participantName: string) {
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

  return { progress, saveProgress, clearProgress };
}
