import { useEffect, useRef } from 'react';

/** Intervalle de l'interrogation de l'AG en direct (spec 043, D12). */
export const LIVE_POLL_INTERVAL_MS = 3000;
/** Délai de reprise après un 429 ou une panne passagère. */
export const LIVE_POLL_RETRY_INTERVAL_MS = 6000;

interface VisiblePollingOptions {
  enabled?: boolean;
  intervalMs?: number;
  /** Relance la boucle (lecture immédiate) quand cette valeur change. */
  resetKey?: unknown;
}

/**
 * Interrogation périodique par `setTimeout` récursif : jamais deux lectures en
 * vol, en pause quand l'onglet est masqué (reprise immédiate au retour).
 *
 * La tâche rend le délai avant la prochaine lecture, `false` pour arrêter, ou
 * rien pour garder l'intervalle par défaut. Une exception ne casse pas la boucle.
 */
export function useVisiblePolling(
  task: () => Promise<number | false | void>,
  { enabled = true, intervalMs = LIVE_POLL_INTERVAL_MS, resetKey }: VisiblePollingOptions = {}
): { refresh: () => void } {
  const taskRef = useRef(task);
  taskRef.current = task;
  const refreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!enabled) {
      refreshRef.current = () => undefined;
      return undefined;
    }
    let cancelled = false;
    let running = false;
    let waitingVisible = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clear = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };
    const run = async (): Promise<void> => {
      timer = undefined;
      if (cancelled || running) return;
      if (document.hidden) {
        waitingVisible = true;
        return;
      }
      running = true;
      let next: number | false | void;
      try {
        next = await taskRef.current();
      } catch {
        next = undefined;
      }
      running = false;
      if (cancelled || next === false) return;
      clear();
      timer = setTimeout(() => void run(), typeof next === 'number' ? next : intervalMs);
    };
    const onVisibility = () => {
      if (document.hidden || !waitingVisible) return;
      waitingVisible = false;
      clear();
      void run();
    };

    refreshRef.current = () => {
      if (running) return;
      clear();
      void run();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void run();
    return () => {
      cancelled = true;
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs, resetKey]);

  return { refresh: () => refreshRef.current() };
}
