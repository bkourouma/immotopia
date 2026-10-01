import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, Card, Col, DatePicker, Empty, Row, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  getTenantAuditLogs,
  TENANT_AUDIT_CATEGORIES,
  TENANT_AUDIT_OUTCOMES,
  type TenantAuditCategory,
  type TenantAuditFilters,
  type TenantAuditLog,
  type TenantAuditOutcome
} from '../../services/tenant-audit-service';
import { getAuditActionLabelFr, getAuditCategoryLabelFr, getAuditOutcomeLabelFr } from '../../constants/audit-labels';
import { getAuditActorDisplay, getAuditOutcomeColor } from '../../utils/tenant-audit-display';
import { AuditResourceCell } from '../../components/audit/AuditResourceCell';
import { ActivityLogDetailModal } from '../../components/tenant/ActivityLogDetailModal';
import { activeLocale, dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

type DateRange = [string, string] | null;
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
  const [category, setCategory] = useState<TenantAuditCategory | undefined>();
  const [outcome, setOutcome] = useState<TenantAuditOutcome | undefined>();
  const [range, setRange] = useState<DateRange>(null);
  const [logs, setLogs] = useState<TenantAuditLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TenantAuditLog | null>(null);
  // Numéro de la dernière requête lancée : une réponse qui n'est pas la
  // dernière attendue (filtre changé entre-temps, page quittée) est ignorée.
  const latestRequest = useRef(0);

  const filters = useMemo<TenantAuditFilters>(
    () => ({ category, outcome, startDate: range?.[0], endDate: range?.[1] }),
    [category, outcome, range]
  );

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

  const columns = useMemo(() => buildColumns(setSelected), []);
  const hasFilters = Boolean(category || outcome || range);

  const resetFilters = () => {
    setCategory(undefined);
    setOutcome(undefined);
    setRange(null);
  };

  const handleRange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setRange(dates?.[0] && dates[1] ? [dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD')] : null);
  };

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

      <Card>
        <Row gutter={[16, 16]} align="bottom">
          <Col xs={24} sm={12} md={6}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              {t('Catégorie')}
            </Text>
            <Select
              style={{ width: '100%' }}
              placeholder={t('Toutes les catégories')}
              aria-label={t('Catégorie')}
              value={category}
              onChange={setCategory}
              allowClear
              options={TENANT_AUDIT_CATEGORIES.map(value => ({ value, label: getAuditCategoryLabelFr(value) }))}
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              {t('Résultat')}
            </Text>
            <Select
              style={{ width: '100%' }}
              placeholder={t('Tous les résultats')}
              aria-label={t('Résultat')}
              value={outcome}
              onChange={setOutcome}
              allowClear
              options={TENANT_AUDIT_OUTCOMES.map(value => ({ value, label: getAuditOutcomeLabelFr(value) }))}
            />
          </Col>
          <Col xs={24} sm={16} md={8}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              {t('Période')}
            </Text>
            <RangePicker
              style={{ width: '100%' }}
              value={range ? [dayjs(range[0]), dayjs(range[1])] : null}
              onChange={handleRange}
              format={dateFormat('short')}
            />
          </Col>
          <Col xs={24} sm={8} md={4}>
            <Button icon={<ReloadOutlined />} onClick={resetFilters} disabled={!hasFilters} block>
              {t('Réinitialiser')}
            </Button>
          </Col>
        </Row>
      </Card>

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

      <ActivityLogDetailModal log={selected} onClose={() => setSelected(null)} />
    </Space>
  );
};
