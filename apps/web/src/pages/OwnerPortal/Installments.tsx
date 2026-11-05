import React from 'react';
import { Card, Row, Col, Typography, Spin, Alert, Tag, Space, Button } from 'antd';
import { DollarOutlined, CalendarOutlined, SyncOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ownerPortalService } from '../../services/ownerPortalService';
import type { OwnerPortalPagination } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import { Table } from '../../components/primitives';
import { useListSearch } from '../../hooks/useListSearch';
import { STALE_TIME } from '../../lib/query-keys';
import { collectAllPages } from '../../utils/table-export/collect';
import { useOwnerPropertyOptions } from './useOwnerPropertyOptions';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';

import { formatFcfa } from '../../i18n/format';
const { Title, Text } = Typography;

interface InstallmentListItem {
  id: string;
  propertyAddress: string;
  tenantName: string;
  period: string;
  dueDate: Date | string;
  penaltyAmount: number;
  paidAmount: number;
  amount: number;
  status: string;
}

interface InstallmentSummary {
  total: number;
  due: number;
  overdue: number;
  paid: number;
  totalAmount: number;
  dueAmount: number;
}

interface InstallmentsData {
  installments: InstallmentListItem[];
  summary: InstallmentSummary;
  pagination?: OwnerPortalPagination;
}

const formatCurrency = (amount: number) => {
  return formatFcfa(amount);
};

const getStatusTag = (status: string) => {
  const statusConfig: Record<string, { color: string; text: string }> = {
    DRAFT: { color: 'default', text: t('Brouillon') },
    DUE: { color: 'blue', text: t('À payer') },
    PARTIAL: { color: 'orange', text: t('Partiel') },
    PAID: { color: 'green', text: t('Payé') },
    OVERDUE: { color: 'red', text: t('En retard') }
  };

  const config = statusConfig[status] || { color: 'default', text: status };
  return <Tag color={config.color}>{config.text}</Tag>;
};

export default function Installments() {
  const { options: propertyOptions } = useOwnerPropertyOptions();

  // Liste paginée par le serveur ; l'API ne trie pas (`sort: false`).
  const search = useListSearch({
    apiNames: { sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Bien, locataire…') },
      {
        key: 'status',
        type: 'multiSelect',
        label: t('Statut'),
        primary: true,
        options: [
          { value: 'DRAFT', label: t('Brouillon') },
          { value: 'DUE', label: t('À payer') },
          { value: 'PARTIAL', label: t('Partiel') },
          { value: 'PAID', label: t('Payé') },
          { value: 'OVERDUE', label: t('En retard') }
        ]
      },
      {
        key: 'propertyId',
        type: 'select',
        label: t('Propriété'),
        primary: true,
        options: propertyOptions
      },
      { key: 'period', type: 'dateRange', label: t('Période'), api: ['startDate', 'endDate'] }
    ]
  });

  const {
    data,
    isPending,
    isFetching,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: ['owner-portal', 'installments', search.apiParams],
    queryFn: async (): Promise<InstallmentsData | null> => {
      const response = await ownerPortalService.getInstallments(search.apiParams);
      return response.data?.success && response.data?.data ? (response.data.data as InstallmentsData) : null;
    },
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  const error: string | null = queryError
    ? (queryError as any).response?.data?.message || t('Erreur lors du chargement des échéances')
    : null;
  const installments = data?.installments ?? [];
  const total = data?.pagination?.total ?? installments.length;

  // Pas de tri d'en-tête : l'API ne trie pas et le tri antd ne porterait que sur la page reçue.
  const columns = [
    {
      title: t('Propriété'),
      dataIndex: 'propertyAddress',
      key: 'propertyAddress'
    },
    {
      title: t('Locataire'),
      dataIndex: 'tenantName',
      key: 'tenantName'
    },
    {
      title: t('Période'),
      dataIndex: 'period',
      key: 'period'
    },
    {
      title: t("Date d'échéance"),
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (date: Date | string) => {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dayjs(dateObj).format('DD/MM/YYYY');
      }
    },
    {
      title: t('Montant'),
      dataIndex: 'amount',
      key: 'amount',
      exportValue: (record: InstallmentListItem) => Number(record.amount),
      render: (amount: number, record: InstallmentListItem) => (
        <Space direction="vertical" size={0}>
          <Text>{formatCurrency(amount)}</Text>
          {Number(record.paidAmount || 0) > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('payé:')} {formatCurrency(Number(record.paidAmount || 0))}
            </Text>
          )}
          {Number(record.penaltyAmount || 0) > 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('dont pénalité:')} {formatCurrency(Number(record.penaltyAmount || 0))}
            </Text>
          )}
        </Space>
      )
    },
    {
      title: t('Pénalité'),
      dataIndex: 'penaltyAmount',
      key: 'penaltyAmount',
      render: (penaltyAmount: number) => (Number(penaltyAmount || 0) > 0 ? formatCurrency(Number(penaltyAmount)) : '-')
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
    }
  ];

  if (isPending && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement des échéances...')} />
      </div>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Échéances')}</Title>
          <Text type="secondary">{t('Suivi des échéances de paiement')}</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={() => refetch()}
          loading={isFetching}
          aria-label={t('Rafraîchir les échéances')}
        >
          {t('Actualiser')}
        </Button>
      </div>

      {/* Summary Cards (T096) : calculées par le serveur sur toutes les lignes filtrées */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Total')}
              value={data.summary.total.toString()}
              icon={<CalendarOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('À payer')}
              value={data.summary.due.toString()}
              icon={<CalendarOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18, color: '#1890ff' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('En retard')}
              value={data.summary.overdue.toString()}
              icon={<CalendarOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ fontSize: 18, color: '#ff4d4f' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Payées')}
              value={data.summary.paid.toString()}
              icon={<CalendarOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
          </Col>
        </Row>
      )}

      {/* Amount Summary Cards */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <StatCard
              title={t('Montant total')}
              value={formatCurrency(data.summary.totalAmount)}
              icon={<DollarOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12}>
            <StatCard
              title={t('Montant dû')}
              value={formatCurrency(data.summary.dueAmount)}
              icon={<DollarOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ fontSize: 18, color: '#faad14' }}
            />
          </Col>
        </Row>
      )}

      {/* Installments Table (T097) */}
      <Card title={t('Liste des échéances')}>
        {error && (
          <Alert
            message={t('Erreur')}
            description={error}
            type="error"
            showIcon
            style={{ marginBottom: 'var(--space-4)' }}
          />
        )}
        <Table
          aria-label={t('Liste des échéances')}
          search={search.searchProps}
          exportFilename={t('Liste des échéances')}
          exportFetchAll={() =>
            collectAllPages<InstallmentListItem>(async (page, limit) => {
              const response = await ownerPortalService.getInstallments({ ...search.filterParams, page, limit });
              const result = response.data?.data as InstallmentsData | undefined;
              return { items: result?.installments ?? [], total: result?.pagination?.total ?? 0 };
            })
          }
          scroll={{ x: 'max-content' }}
          columns={columns}
          dataSource={installments}
          rowKey="id"
          loading={isFetching}
          pagination={search.tablePagination(total)}
          locale={search.isFiltered ? undefined : { emptyText: t('Aucune échéance trouvée') }}
        />
      </Card>
    </Space>
  );
}
