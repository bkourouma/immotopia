import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVisiblePolling } from '../../hooks/useVisiblePolling';

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
