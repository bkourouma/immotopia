import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Alert, Button, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { syncAccounting } from '../../../../services/accounting-exports-service';
import type { SyncMeta } from '../../../../services/accounting-exports-service';
import { useVisiblePolling } from '../../../../hooks/useVisiblePolling';
import { t } from '../../../../i18n/t';
import { isAccountingQuery } from './accounting-query';

const { Text } = Typography;

/** Délai entre deux relectures tant que la synchronisation tourne. */
export const SYNC_POLL_INTERVAL_MS = 3000;

export interface AccountingSyncState {
  status: SyncMeta['status'];
  running: boolean;
  lastSyncedAt: string | null;
  /** Un `syncAccounting` demandé par le bouton est en cours. */
  refreshing: boolean;
  /** « Actualiser les écritures » : force la synchronisation, puis relit tout. */
  refresh: () => Promise<void>;
}

/**
 * Suit la synchronisation des écritures d'une agence.
 *
 * Tant que `sync.status === 'running'`, relit toutes les requêtes comptables
 * actives toutes les 3 s (en pause quand l'onglet est masqué, voir
 * `useVisiblePolling`) ; s'arrête dès que la réponse revient `idle` ou `error`.
 * `sync` vient de la dernière lecture de la page (`data?.sync`).
 */
export function useAccountingSync(tenantId: string | undefined, sync: SyncMeta | undefined): AccountingSyncState {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [refreshing, setRefreshing] = useState(false);
  const running = sync?.status === 'running';

  const invalidateAll = useCallback(
    () =>
      queryClient.invalidateQueries({
        predicate: query => isAccountingQuery(query.queryKey, tenantId),
        refetchType: 'active'
      }),
    [queryClient, tenantId]
  );

  // La première exécution de la boucle est immédiate : la page vient de lire,
  // inutile de relire dans la foulée.
  const armed = useRef(false);
  useEffect(() => {
    armed.current = false;
  }, [running]);
  useVisiblePolling(
    async () => {
      if (!armed.current) {
        armed.current = true;
        return;
      }
      await invalidateAll();
    },
    { enabled: running && Boolean(tenantId), intervalMs: SYNC_POLL_INTERVAL_MS }
  );

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setRefreshing(true);
    try {
      await syncAccounting(tenantId);
      await invalidateAll();
    } catch {
      message.error(t('La mise à jour des écritures a échoué.'));
    } finally {
      setRefreshing(false);
    }
  }, [tenantId, invalidateAll, message]);

  return {
    status: sync?.status ?? 'idle',
    running,
    lastSyncedAt: sync?.lastSyncedAt ?? null,
    refreshing,
    refresh
  };
}

/** Bandeau discret tant que les écritures se mettent à jour ; rien sinon. */
export const SyncBanner: React.FC<{ state: AccountingSyncState }> = ({ state }) =>
  state.running ? (
    <Alert
      type="info"
      showIcon
      message={t('Mise à jour des écritures en cours…')}
      style={{ marginBlockEnd: 'var(--space-4)' }}
    />
  ) : null;

/** Heure de dernière mise à jour (ou échec) et bouton « Actualiser les écritures ». */
export const SyncStatus: React.FC<{ state: AccountingSyncState }> = ({ state }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)' }}>
    {state.status === 'error' ? (
      <Text type="secondary">{t('La dernière mise à jour des écritures a échoué.')}</Text>
    ) : state.lastSyncedAt ? (
      <Text type="secondary">{t('Mis à jour à {{heure}}', { heure: dayjs(state.lastSyncedAt).format('HH:mm') })}</Text>
    ) : null}
    <Button icon={<ReloadOutlined />} loading={state.refreshing} onClick={() => void state.refresh()}>
      {t('Actualiser les écritures')}
    </Button>
  </div>
);
