import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { selectedWeek } from '../lib/week';

// Keep the planning destination explicit while moving through a vote.
export function useWeekPath() {
  const [params] = useSearchParams();
  const value = params.get('week');
  const week = value ? selectedWeek(value) : null;
  return useCallback((path: string) => week ? `${path}?week=${encodeURIComponent(week)}` : path, [week]);
}
