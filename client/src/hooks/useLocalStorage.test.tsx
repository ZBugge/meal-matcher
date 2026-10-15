import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLocalStorage, useSwipeProgress } from './useLocalStorage';

beforeEach(() => localStorage.clear());

const ballot = {
  sessionId: 'session-a', participantId: 'sam-id', participantName: 'Sam',
  swipes: { pizza: 1, tacos: 2 }, currentIndex: 2, savedAt: 123,
};

describe('swipe progress recovery', () => {
  it('hydrates a changed key without writing placeholder or prior participant data over it', () => {
    localStorage.setItem('swipe_session_session-a_Sam', JSON.stringify(ballot));
    const { result, rerender } = renderHook(({ name }) => useSwipeProgress('session-a', name), {
      initialProps: { name: '' },
    });
    expect(result.current.progress).toBeNull();
    rerender({ name: 'Sam' });
    expect(result.current.progress).toEqual(ballot);
    expect(JSON.parse(localStorage.getItem('swipe_session_session-a_Sam')!)).toEqual(ballot);
    rerender({ name: 'Alex' });
    expect(result.current.progress).toBeNull();
    expect(JSON.parse(localStorage.getItem('swipe_session_session-a_Sam')!)).toEqual(ballot);
  });

  it('removes cleared drafts and does not recreate them as JSON null', () => {
    localStorage.setItem('swipe_session_session-a_Sam', JSON.stringify(ballot));
    const { result, unmount } = renderHook(() => useSwipeProgress('session-a', 'Sam', 'sam-id'));
    act(() => result.current.clearProgress());
    expect(result.current.progress).toBeNull();
    expect(localStorage.getItem('swipe_session_session-a_Sam')).toBeNull();
    unmount();
    expect(renderHook(() => useSwipeProgress('session-a', 'Sam', 'sam-id')).result.current.progress).toBeNull();
  });

  it('ignores a draft from a different participant or session', () => {
    localStorage.setItem('swipe_session_session-a_Sam', JSON.stringify(ballot));
    const { result, rerender } = renderHook(({ id }) => useSwipeProgress('session-a', 'Sam', id), {
      initialProps: { id: 'new-sam-id' },
    });
    expect(result.current.progress).toBeNull();
    rerender({ id: 'sam-id' });
    expect(result.current.progress).toEqual(ballot);
    localStorage.setItem('swipe_session_session-b_Sam', JSON.stringify(ballot));
    expect(renderHook(() => useSwipeProgress('session-b', 'Sam', 'sam-id')).result.current.progress).toBeNull();
  });

  it('persists the explicit cursor when revisiting an already voted option', () => {
    const { result, unmount } = renderHook(() => useSwipeProgress('session-a', 'Sam', 'sam-id'));
    act(() => result.current.saveProgress('sam-id', ballot.swipes, 0));
    unmount();
    const recovered = renderHook(() => useSwipeProgress('session-a', 'Sam', 'sam-id'));
    expect(recovered.result.current.progress).toMatchObject({ swipes: ballot.swipes, currentIndex: 0 });
  });

  it('applies functional updates to the current key', () => {
    localStorage.setItem('first', '1');
    localStorage.setItem('second', '10');
    const { result, rerender } = renderHook(({ storageKey }) => useLocalStorage(storageKey, 0), {
      initialProps: { storageKey: 'first' },
    });
    rerender({ storageKey: 'second' });
    act(() => result.current[1](value => value + 1));
    expect(result.current[0]).toBe(11);
    expect(localStorage.getItem('first')).toBe('1');
    expect(localStorage.getItem('second')).toBe('11');
  });
});
