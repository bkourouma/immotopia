import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  LIVE_POLL_BACKOFF_MAX_MS,
  LIVE_POLL_INTERVAL_MS,
  liveBackoffDelay,
  useVisiblePolling
} from '../../hooks/useVisiblePolling';

describe('useVisiblePolling : refresh pendant une lecture en vol', () => {
  it('relance une lecture dès que la lecture en cours se termine, sans la perdre', async () => {
    const finishers: Array<() => void> = [];
    const task = vi.fn(
      () =>
        new Promise<number | false>(done => {
          finishers.push(() => done(false));
        })
    );
    const { result } = renderHook(() => useVisiblePolling(task, { intervalMs: 60_000 }));
    expect(task).toHaveBeenCalledTimes(1);

    // La lecture est en vol : deux demandes valent une seule relance, faite après elle.
    act(() => result.current.refresh());
    act(() => result.current.refresh());
    expect(task).toHaveBeenCalledTimes(1);

    await act(async () => finishers[0]());
    expect(task).toHaveBeenCalledTimes(2);

    await act(async () => finishers[1]());
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('sans demande, ne relance rien quand la tâche arrête l’interrogation', async () => {
    const task = vi.fn().mockResolvedValue(false);
    renderHook(() => useVisiblePolling(task, { intervalMs: 60_000 }));
    await act(async () => undefined);
    expect(task).toHaveBeenCalledTimes(1);
  });
});

describe('useVisiblePolling : cadence et attente croissante', () => {
  it('interroge toutes les 5 s par défaut', () => {
    expect(LIVE_POLL_INTERVAL_MS).toBe(5000);
  });

  it('attend 10 s puis 15 s (plafond) après des échecs consécutifs, 5 s au premier succès', () => {
    expect(liveBackoffDelay(0)).toBeUndefined();
    expect(liveBackoffDelay(1)).toBe(10_000);
    expect(liveBackoffDelay(2)).toBe(15_000);
    expect(liveBackoffDelay(7)).toBe(LIVE_POLL_BACKOFF_MAX_MS);
    expect(LIVE_POLL_BACKOFF_MAX_MS).toBe(15_000);
  });

  it('applique le délai rendu par la tâche, puis reprend l’intervalle par défaut', async () => {
    vi.useFakeTimers();
    try {
      let failures = 0;
      const task = vi.fn(async () => {
        failures = task.mock.calls.length <= 2 ? failures + 1 : 0;
        return liveBackoffDelay(failures);
      });
      renderHook(() => useVisiblePolling(task));
      await act(async () => undefined);
      expect(task).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9_999);
      });
      expect(task).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(task).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(task).toHaveBeenCalledTimes(3);
      // Succès : retour à 5 s.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(task).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('suspend l’interrogation quand enabled est faux et reprend aussitôt à la réactivation', async () => {
    vi.useFakeTimers();
    try {
      const task = vi.fn().mockResolvedValue(undefined);
      const { rerender } = renderHook(({ enabled }) => useVisiblePolling(task, { enabled }), {
        initialProps: { enabled: true }
      });
      await act(async () => undefined);
      expect(task).toHaveBeenCalledTimes(1);
      rerender({ enabled: false });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(task).toHaveBeenCalledTimes(1);
      rerender({ enabled: true });
      await act(async () => undefined);
      expect(task).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
