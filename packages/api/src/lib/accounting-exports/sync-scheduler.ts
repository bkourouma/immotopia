import { logger } from '../../utils/logger';
import { syncAllOwnerAccounts } from '../owner-account/service';
import type { SyncMeta } from './types';

/**
 * Ordonnanceur de la synchronisation des comptes propriétaires (lot C).
 *
 * Les écritures de gestion locative ne sont produites que par
 * `syncAllOwnerAccounts`, longue pour une agence : les lectures d'affichage
 * ne l'attendent plus (stale-while-revalidate), elles la déclenchent en
 * arrière-plan et renvoient l'état courant. Les exports, eux, l'attendent
 * pour ne pas partir avec des écritures incomplètes.
 *
 * État en mémoire de l'instance, par agence. Une seule synchronisation à la
 * fois par agence (single-flight).
 */

/** Une synchronisation réussie depuis moins de cette durée est considérée fraîche. */
export const SYNC_FRESHNESS_MS = 60_000;

interface TenantSyncState {
  running: Promise<void> | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  status: SyncMeta['status'];
}

const states = new Map<string, TenantSyncState>();

function stateOf(tenantId: string): TenantSyncState {
  let state = states.get(tenantId);
  if (!state) {
    state = { running: null, lastSuccessAt: null, lastFailureAt: null, status: 'idle' };
    states.set(tenantId, state);
  }
  return state;
}

const isFresh = (at: number | null) => at !== null && Date.now() - at < SYNC_FRESHNESS_MS;

/** Lance une synchronisation. La promesse renvoyée rejette en cas d'échec ; l'état est tenu à jour dans les deux cas. */
function start(tenantId: string, state: TenantSyncState): Promise<void> {
  state.status = 'running';
  const run = (async () => {
    try {
      await syncAllOwnerAccounts(tenantId);
      state.lastSuccessAt = Date.now();
      state.status = 'idle';
    } catch (error) {
      state.lastFailureAt = Date.now();
      state.status = 'error';
      logger.error('Synchronisation des comptes propriétaires en échec', {
        tenantId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      state.running = null;
    }
  })();
  state.running = run;
  return run;
}

export function getSyncState(tenantId: string): SyncMeta {
  const state = stateOf(tenantId);
  return {
    status: state.running ? 'running' : state.status,
    lastSyncedAt: state.lastSuccessAt === null ? null : new Date(state.lastSuccessAt).toISOString()
  };
}

/** Lectures d'affichage : déclenche si besoin, n'attend jamais. */
export function requestBackgroundSync(tenantId: string): SyncMeta {
  const state = stateOf(tenantId);
  if (!state.running && !isFresh(state.lastSuccessAt) && !isFresh(state.lastFailureAt)) {
    // Échec déjà journalisé dans `start` : on évite seulement le rejet non rattrapé.
    start(tenantId, state).catch(() => undefined);
  }
  return getSyncState(tenantId);
}

/** Exports : rejoint la synchronisation en cours, ou en lance une si l'état n'est pas frais ; rejette en cas d'échec. */
export async function awaitFreshSync(tenantId: string): Promise<SyncMeta> {
  const state = stateOf(tenantId);
  if (state.running) {
    await state.running;
  } else if (!isFresh(state.lastSuccessAt)) {
    await start(tenantId, state);
  }
  return getSyncState(tenantId);
}

/** Actualisation demandée : rejoint la synchronisation en cours, sinon en lance une quelle que soit la fraîcheur. */
export async function forceSync(tenantId: string): Promise<SyncMeta> {
  const state = stateOf(tenantId);
  await (state.running ?? start(tenantId, state));
  return getSyncState(tenantId);
}

export function resetSyncSchedulerForTests(): void {
  states.clear();
}
