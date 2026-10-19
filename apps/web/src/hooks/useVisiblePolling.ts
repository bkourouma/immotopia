import { useEffect, useRef } from 'react';

/** Intervalle de l'interrogation de l'AG en direct (spec 043, D12). */
export const LIVE_POLL_INTERVAL_MS = 5000;
/** Premier délai de reprise après un 429 ou une panne passagère (puis 15 s au plus, voir `liveBackoffDelay`). */
export const LIVE_POLL_RETRY_INTERVAL_MS = 10000;
/** Plafond de l'attente croissante après des échecs consécutifs. */
export const LIVE_POLL_BACKOFF_MAX_MS = 15000;

/**
 * Délai avant la prochaine lecture après `failures` échecs consécutifs (5xx, 429, réseau) :
 * 10 s, puis 15 s (plafond). Zéro échec : `undefined`, la tâche garde l'intervalle normal
 * (retour à 5 s au premier succès).
 */
export function liveBackoffDelay(failures: number, baseMs: number = LIVE_POLL_INTERVAL_MS): number | undefined {
  if (failures <= 0) return undefined;
  return Math.min(LIVE_POLL_BACKOFF_MAX_MS, baseMs * (failures + 1));
}

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
 * Un `refresh()` demandé pendant une lecture en vol la fait suivre d'une seconde, aussitôt.
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
    // Un `refresh()` demandé pendant une lecture : relancé dès qu'elle se termine, jamais perdu.
    let rerun = false;
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
      if (cancelled) return;
      if (rerun) {
        rerun = false;
        clear();
        void run();
        return;
      }
      if (next === false) return;
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
      if (running) {
        rerun = true;
        return;
      }
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
