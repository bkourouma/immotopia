import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, Card, Empty, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EyeOutlined } from '@ant-design/icons';
import {
  getTenantAuditLogs,
  TENANT_AUDIT_CATEGORIES,
  TENANT_AUDIT_OUTCOMES,
  type TenantAuditFilters,
  type TenantAuditLog
} from '../../services/tenant-audit-service';
import {
  AUDIT_ACTION_LABELS_FR,
  getAuditActionLabelFr,
  getAuditCategoryLabelFr,
  getAuditOutcomeLabelFr
} from '../../constants/audit-labels';
import { useListSearch } from '../../hooks/useListSearch';
import { getAuditActorDisplay, getAuditOutcomeColor } from '../../utils/tenant-audit-display';
import { AuditResourceCell } from '../../components/audit/AuditResourceCell';
import { ActivityLogDetailModal } from '../../components/tenant/ActivityLogDetailModal';
import { Table } from '../../components/primitives';
import { EXPORT_MAX_ROWS } from '../../utils/table-export/collect';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

type ApiError = { response?: { data?: { message?: string } } };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(activeLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildColumns(onOpen: (log: TenantAuditLog) => void): ColumnsType<TenantAuditLog> {
  return [
    {
      title: t('Date'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (iso: string) => formatDate(iso)
    },
    { title: t('Acteur'), key: 'actor', width: 200, render: (_, log) => getAuditActorDisplay(log) },
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

export const TenantActivityLog: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [logs, setLogs] = useState<TenantAuditLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TenantAuditLog | null>(null);
  // Numéro de la dernière requête lancée : une réponse qui n'est pas la
  // dernière attendue (filtre changé entre-temps, page quittée) est ignorée.
  const latestRequest = useRef(0);

  // Critères portés par l'URL (?q=…&category=AUTH&periodFrom=…). Le curseur « Charger plus »
  // reste local : un changement de critère repart de la première page.
  const search = useListSearch({
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Action (code), ressource, identifiant ou acteur…')
      },
      {
        key: 'category',
        type: 'select',
        label: t('Catégorie'),
        primary: true,
        options: TENANT_AUDIT_CATEGORIES.map(value => ({ value, label: getAuditCategoryLabelFr(value) }))
      },
      { key: 'period', type: 'dateRange', label: t('Période'), primary: true, api: ['startDate', 'endDate'] },
      {
        key: 'outcome',
        type: 'select',
        label: t('Résultat'),
        options: TENANT_AUDIT_OUTCOMES.map(value => ({ value, label: getAuditOutcomeLabelFr(value) }))
      },
      {
        key: 'actionKey',
        type: 'select',
        label: t('Action'),
        options: Object.entries(AUDIT_ACTION_LABELS_FR)
          .map(([value, label]) => ({ value, label }))
          .sort((x, y) => x.label.localeCompare(y.label, activeLocale()))
      }
    ]
  });
  // Les filtres envoyés à l'API : critères seuls, sans page ni tri (pagination par curseur).
  const filterKey = JSON.stringify(search.filterParams);
  const filters = useMemo(() => search.filterParams as TenantAuditFilters, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPage = useCallback(
    async (cursor?: string) => {
      if (!tenantId) return;
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
        const response = await getTenantAuditLogs(tenantId, { ...filters, cursor });
        if (request !== latestRequest.current) return;
        if (!response.success) {
          setError(t("Erreur lors du chargement du journal d'activité"));
          return;
        }
        setLogs(previous => (append ? [...previous, ...response.data.logs] : response.data.logs));
        setNextCursor(response.data.nextCursor);
      } catch (err) {
        if (request !== latestRequest.current) return;
        setError((err as ApiError).response?.data?.message || t("Erreur lors du chargement du journal d'activité"));
      } finally {
        if (request === latestRequest.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [tenantId, filters]
  );

  useEffect(() => {
    void fetchPage();
    return () => {
      latestRequest.current += 1;
    };
  }, [fetchPage]);

  // Export : même route et mêmes filtres que la liste, en suivant les curseurs
  // jusqu'au plafond d'export.
  const fetchAllLogs = useCallback(async () => {
    if (!tenantId) return { items: [] as TenantAuditLog[], truncated: false };
    const items: TenantAuditLog[] = [];
    let cursor: string | undefined;
    do {
      const response = await getTenantAuditLogs(tenantId, { ...filters, cursor, limit: 100 });
      if (!response.success) throw new Error(t("Erreur lors du chargement du journal d'activité"));
      items.push(...response.data.logs);
      cursor = response.data.nextCursor ?? undefined;
    } while (cursor && items.length < EXPORT_MAX_ROWS);
    const truncated = Boolean(cursor) || items.length > EXPORT_MAX_ROWS;
    if (items.length > EXPORT_MAX_ROWS) items.length = EXPORT_MAX_ROWS;
    return { items, truncated };
  }, [tenantId, filters]);

  const columns = useMemo(() => buildColumns(setSelected), []);
  const retry = () => {
    // Un échec en cours de liste ne perd pas les lignes déjà reçues.
    void fetchPage(logs.length > 0 && nextCursor ? nextCursor : undefined);
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={2} style={{ margin: 0 }}>
          {t("Journal d'activité")}
        </Title>
        <Text type="secondary">{t('Qui a fait quoi, et quand, dans votre agence.')}</Text>
      </div>

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
        <Table<TenantAuditLog>
          helpId="administration.agence.activite.journal"
          aria-label={t("Journal d'activité")}
          search={search.searchProps}
          exportFilename={t("Journal d'activité")}
          exportFetchAll={fetchAllLogs}
          rowKey="id"
          columns={columns}
          dataSource={logs}
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
          onRow={log => ({ onClick: () => setSelected(log), style: { cursor: 'pointer' } })}
          locale={
            search.isFiltered
              ? loading || error
                ? { emptyText: <span /> }
                : undefined
              : { emptyText: loading || error ? <span /> : <Empty description={t('Aucune activité enregistrée')} /> }
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

      <ActivityLogDetailModal log={selected} onClose={() => setSelected(null)} />
    </Space>
  );
};
