import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Card, Empty, Space, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import {
  exportAuditLogs,
  getAuditLogs,
  type PlatformAuditExportFilters,
  type PlatformAuditLog
} from '../../services/audit-service';
import {
  getAuditActionLabelFr,
  getAuditActorTypeLabelFr,
  getAuditCategoryLabelFr,
  getAuditOutcomeLabelFr
} from '../../constants/audit-labels';
import { TENANT_AUDIT_CATEGORIES, TENANT_AUDIT_OUTCOMES } from '../../services/tenant-audit-service';
import { getTenantAdmin, listTenants } from '../../services/tenant-service';
import { useListSearch } from '../../hooks/useListSearch';
import { getAuditOutcomeColor } from '../../utils/tenant-audit-display';
import { getPlatformActorDisplay } from '../../utils/platform-audit-display';
import { saveBlob } from '../../utils/save-blob';
import { useAuth } from '../../hooks/useAuth';
import { AuditResourceCell } from '../../components/audit/AuditResourceCell';
import { PlatformAuditDetailModal } from '../../components/admin/PlatformAuditDetailModal';
import { AuditIntegrityCard } from '../../components/admin/AuditIntegrityCard';
import { Table } from '../../components/primitives';
import { EXPORT_MAX_ROWS } from '../../utils/table-export/collect';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

type ApiError = { response?: { status?: number; data?: { message?: string } } };

const ACTOR_TYPES = ['USER', 'SUPER_ADMIN', 'PORTAL', 'SYSTEM', 'AI'] as const;
const TENANT_OPTIONS_LIMIT = 20;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(activeLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
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
  const [logs, setLogs] = useState<PlatformAuditLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlatformAuditLog | null>(null);
  // Numéro de la dernière requête lancée : une réponse périmée (filtre changé
  // entre-temps, page quittée) est ignorée.
  const latestRequest = useRef(0);

  // Recherche multicritères (état dans l'URL). Liste à curseur : `page` ne sert pas,
  // seuls les critères (`filterParams`) partent à l'API ; le curseur reste local.
  const search = useListSearch({
    apiNames: { sort: false },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Action, ressource, acteur, identifiant de requête…')
      },
      {
        key: 'tenantId',
        type: 'select',
        label: t('Agence'),
        primary: true,
        placeholder: t('Toutes les agences'),
        loadOptions: async term => {
          const response = await listTenants({
            search: term.trim() || undefined,
            page: 1,
            limit: TENANT_OPTIONS_LIMIT
          });
          return response.data.tenants.map(tenant => ({ value: tenant.id, label: tenant.name }));
        },
        resolveLabel: async id => (await getTenantAdmin(id)).data?.name
      },
      {
        key: 'category',
        type: 'select',
        label: t('Catégorie'),
        primary: true,
        options: TENANT_AUDIT_CATEGORIES.map(value => ({ value, label: getAuditCategoryLabelFr(value) }))
      },
      {
        key: 'outcome',
        type: 'select',
        label: t('Résultat'),
        options: TENANT_AUDIT_OUTCOMES.map(value => ({ value, label: getAuditOutcomeLabelFr(value) }))
      },
      {
        key: 'actorType',
        type: 'select',
        label: t("Type d'acteur"),
        options: ACTOR_TYPES.map(value => ({ value, label: getAuditActorTypeLabelFr(value) }))
      },
      {
        key: 'visibility',
        type: 'select',
        label: t('Visibilité'),
        options: [
          { value: 'TENANT', label: t("Visibles de l'agence") },
          { value: 'PLATFORM_ONLY', label: t('Réservées à la plateforme') }
        ]
      },
      { key: 'period', type: 'dateRange', label: t('Période'), api: ['startDate', 'endDate'] }
    ]
  });

  // Clé sérialisée : la lecture ne se relance que lorsque le contenu des critères change.
  const filtersKey = JSON.stringify(search.filterParams);
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

  // Export Excel/CSV/PDF du tableau : même route et mêmes filtres que la liste
  // (donc mêmes droits), en suivant les curseurs jusqu'au plafond d'export.
  // L'export CSV serveur ci-dessus reste réservé au SUPER_ADMIN.
  const fetchAllLogs = useCallback(async () => {
    const items: PlatformAuditLog[] = [];
    let cursor: string | undefined;
    do {
      const response = await getAuditLogs({ ...filters, cursor, limit: 100 });
      if (!response.success) throw new Error(t("Erreur lors du chargement du journal d'audit"));
      items.push(...response.data.logs);
      cursor = response.data.nextCursor ?? undefined;
    } while (cursor && items.length < EXPORT_MAX_ROWS);
    const truncated = Boolean(cursor) || items.length > EXPORT_MAX_ROWS;
    if (items.length > EXPORT_MAX_ROWS) items.length = EXPORT_MAX_ROWS;
    return { items, truncated };
  }, [filters]);

  const columns = useMemo(() => buildColumns(setSelected), []);
  // Le détail propose de voir toute la requête : l'identifiant devient la recherche libre.
  const filterByRequest = (id: string) => {
    search.setValues({ q: id });
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
          helpId="administration.pilotage.audit.tableau"
          aria-label={t("Journal d'audit")}
          search={search.searchProps}
          exportFilename={t("Journal d'audit")}
          exportFetchAll={fetchAllLogs}
          rowKey="id"
          columns={columns}
          dataSource={logs}
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          onRow={log => ({ onClick: () => setSelected(log), style: { cursor: 'pointer' } })}
          locale={
            loading || error
              ? { emptyText: <span /> }
              : search.isFiltered
                ? undefined
                : { emptyText: <Empty description={t('Aucune activité enregistrée')} /> }
          }
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
