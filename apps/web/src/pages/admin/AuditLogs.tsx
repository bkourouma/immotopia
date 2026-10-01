import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Card, Empty, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import {
  exportAuditLogs,
  getAuditLogs,
  type PlatformAuditExportFilters,
  type PlatformAuditLog
} from '../../services/audit-service';
import { getAuditActionLabelFr, getAuditCategoryLabelFr, getAuditOutcomeLabelFr } from '../../constants/audit-labels';
import { getAuditOutcomeColor } from '../../utils/tenant-audit-display';
import { getPlatformActorDisplay } from '../../utils/platform-audit-display';
import { saveBlob } from '../../utils/save-blob';
import { useAuth } from '../../hooks/useAuth';
import { AuditResourceCell } from '../../components/audit/AuditResourceCell';
import { PlatformAuditDetailModal } from '../../components/admin/PlatformAuditDetailModal';
import { AuditIntegrityCard } from '../../components/admin/AuditIntegrityCard';
import {
  EMPTY_AUDIT_FILTERS,
  PlatformAuditFilterBar,
  type PlatformAuditFilterState
} from '../../components/admin/PlatformAuditFilterBar';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

type ApiError = { response?: { status?: number; data?: { message?: string } } };

const TEXT_FILTER_DELAY_MS = 400;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(activeLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Valeur qui ne suit la saisie qu'après une courte pause : un appel à l'API par mot, pas par lettre. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function buildColumns(onOpen: (log: PlatformAuditLog) => void): ColumnsType<PlatformAuditLog> {
  return [
    {
      title: t('Date'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (iso: string) => formatDate(iso)
    },
    { title: t('Agence'), key: 'tenant', width: 160, render: (_, log) => log.tenant?.name ?? '—' },
    { title: t('Acteur'), key: 'actor', width: 200, render: (_, log) => getPlatformActorDisplay(log) },
    { title: t('Action'), key: 'action', render: (_, log) => getAuditActionLabelFr(log.action) },
    { title: t('Ressource'), key: 'resource', render: (_, log) => <AuditResourceCell log={log} /> },
    {
      title: t('Résultat'),
      key: 'outcome',
      width: 110,
      render: (_, log) => <Tag color={getAuditOutcomeColor(log.outcome)}>{getAuditOutcomeLabelFr(log.outcome)}</Tag>
    },
    { title: t('Catégorie'), key: 'category', width: 150, render: (_, log) => getAuditCategoryLabelFr(log.category) },
    {
      title: t('Visibilité'),
      key: 'visibility',
      width: 110,
      render: (_, log) =>
        log.visibility === 'PLATFORM_ONLY' ? (
          <Tooltip title={t('Réservée à la plateforme')}>
            <Tag color="purple">{t('Plateforme')}</Tag>
          </Tooltip>
        ) : null
    },
    {
      title: '',
      key: 'open',
      width: 90,
      render: (_, log) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onOpen(log)}>
          {t('Voir')}
        </Button>
      )
    }
  ];
}

/** Filtres envoyés à l'API (liste et export) : seulement des clés définies. */
function toApiFilters(
  state: PlatformAuditFilterState,
  actionKey: string,
  requestId: string
): PlatformAuditExportFilters {
  return {
    tenantId: state.tenantId,
    category: state.category as PlatformAuditExportFilters['category'],
    outcome: state.outcome as PlatformAuditExportFilters['outcome'],
    actorType: state.actorType as PlatformAuditExportFilters['actorType'],
    visibility: state.visibility === 'ALL' ? undefined : state.visibility,
    startDate: state.range?.[0],
    endDate: state.range?.[1],
    actionKey: actionKey.trim().toUpperCase() || undefined,
    requestId: requestId.trim() || undefined
  };
}

interface AuditExportState {
  exporting: boolean;
  truncated: boolean;
  forbidden: boolean;
  dismissTruncated: () => void;
  run: () => Promise<void>;
}

/** Export CSV avec les filtres courants. Un 403 retire le bouton : le front ne connaît pas la permission. */
function useAuditExport(filters: PlatformAuditExportFilters): AuditExportState {
  const { message } = App.useApp();
  const [exporting, setExporting] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const run = async () => {
    setExporting(true);
    setTruncated(false);
    try {
      const result = await exportAuditLogs(filters);
      saveBlob(result.blob, result.filename);
      setTruncated(result.truncated);
    } catch (err) {
      const error = err as ApiError;
      if (error.response?.status === 403) setForbidden(true);
      message.error(error.response?.data?.message || t("Erreur lors de l'export du journal d'audit"));
    } finally {
      setExporting(false);
    }
  };

  return { exporting, truncated, forbidden, dismissTruncated: () => setTruncated(false), run };
}

export const AuditLogs: React.FC = () => {
  const { user } = useAuth();
  const [state, setState] = useState<PlatformAuditFilterState>(EMPTY_AUDIT_FILTERS);
  const [logs, setLogs] = useState<PlatformAuditLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlatformAuditLog | null>(null);
  // Numéro de la dernière requête lancée : une réponse périmée (filtre changé
  // entre-temps, page quittée) est ignorée.
  const latestRequest = useRef(0);

  const actionKey = useDebounced(state.actionText, TEXT_FILTER_DELAY_MS);
  const requestId = useDebounced(state.requestIdText, TEXT_FILTER_DELAY_MS);
  // Clé sérialisée : taper dans un champ texte recalcule les filtres, mais ne
  // relance la lecture que lorsque leur contenu change vraiment.
  const filtersKey = JSON.stringify(toApiFilters(state, actionKey, requestId));
  const filters = useMemo<PlatformAuditExportFilters>(() => JSON.parse(filtersKey), [filtersKey]);
  const auditExport = useAuditExport(filters);
  const canExport = user?.globalRole === 'SUPER_ADMIN' && !auditExport.forbidden;

  const fetchPage = useCallback(
    async (cursor?: string) => {
      const request = ++latestRequest.current;
      const append = cursor !== undefined;
      setError(null);
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setLoadingMore(false);
        setLogs([]);
        setNextCursor(null);
      }
      try {
        const response = await getAuditLogs({ ...filters, cursor });
        if (request !== latestRequest.current) return;
        if (!response.success) {
          setError(t("Erreur lors du chargement du journal d'audit"));
          return;
        }
        setLogs(previous => (append ? [...previous, ...response.data.logs] : response.data.logs));
        setNextCursor(response.data.nextCursor);
      } catch (err) {
        if (request !== latestRequest.current) return;
        setError((err as ApiError).response?.data?.message || t("Erreur lors du chargement du journal d'audit"));
      } finally {
        if (request === latestRequest.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [filters]
  );

  useEffect(() => {
    void fetchPage();
    return () => {
      latestRequest.current += 1;
    };
  }, [fetchPage]);

  const columns = useMemo(() => buildColumns(setSelected), []);
  const hasFilters = JSON.stringify(state) !== JSON.stringify(EMPTY_AUDIT_FILTERS);
  const patchState = (patch: Partial<PlatformAuditFilterState>) => setState(previous => ({ ...previous, ...patch }));
  const filterByRequest = (id: string) => {
    patchState({ requestIdText: id });
    setSelected(null);
  };
  // Un échec en cours de liste ne perd pas les lignes déjà reçues.
  const retry = () => void fetchPage(logs.length > 0 && nextCursor ? nextCursor : undefined);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            {t("Journal d'audit")}
          </Title>
          <Text type="secondary">{t('Toutes les actions de toutes les agences et de la plateforme.')}</Text>
        </div>
        {canExport && (
          <Button icon={<DownloadOutlined />} onClick={() => void auditExport.run()} loading={auditExport.exporting}>
            {t('Exporter en CSV')}
          </Button>
        )}
      </Space>

      {auditExport.truncated && (
        <Alert
          type="warning"
          showIcon
          closable
          onClose={auditExport.dismissTruncated}
          message={t("L'export est limité à 50 000 lignes : affinez les filtres pour obtenir tout le journal.")}
        />
      )}

      <PlatformAuditFilterBar
        value={state}
        onChange={patchState}
        onReset={() => setState(EMPTY_AUDIT_FILTERS)}
        hasFilters={hasFilters}
      />

      <AuditIntegrityCard />

      {error && (
        <Alert
          type="error"
          showIcon
          message={t('Erreur')}
          description={error}
          action={
            <Button size="small" onClick={retry}>
              {t('Réessayer')}
            </Button>
          }
        />
      )}

      <Card>
        <Table<PlatformAuditLog>
          rowKey="id"
          columns={columns}
          dataSource={logs}
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          onRow={log => ({ onClick: () => setSelected(log), style: { cursor: 'pointer' } })}
          locale={{
            emptyText:
              loading || error ? <span /> : <Empty description={t('Aucune activité enregistrée pour ces critères')} />
          }}
        />
        {nextCursor && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Button onClick={() => void fetchPage(nextCursor)} loading={loadingMore} disabled={loadingMore}>
              {t('Charger plus')}
            </Button>
          </div>
        )}
      </Card>

      <PlatformAuditDetailModal log={selected} onClose={() => setSelected(null)} onFilterRequest={filterByRequest} />
    </Space>
  );
};
