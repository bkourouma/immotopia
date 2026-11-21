import React from 'react';
import { Row, Col, Typography, Tag, Space, Button } from 'antd';
import { DollarOutlined, CalendarOutlined, SyncOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ownerPortalService } from '../../services/ownerPortalService';
import type { OwnerPortalPagination } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import { DataCard, DataView, PageHeader, SkeletonStats } from '../../components/primitives';
import { useListSearch } from '../../hooks/useListSearch';
import { STALE_TIME } from '../../lib/query-keys';
import { collectAllPages } from '../../utils/table-export/collect';
import { useOwnerPropertyOptions } from './useOwnerPropertyOptions';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';

import { formatFcfa } from '../../i18n/format';
const { Text } = Typography;

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
  const columns: ColumnsType<InstallmentListItem> = [
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

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageHeader
        title={t('Échéances')}
        subtitle={t('Suivi des échéances de paiement')}
        extra={
          <Button
            icon={<SyncOutlined />}
            onClick={() => refetch()}
            loading={isFetching}
            aria-label={t('Rafraîchir les échéances')}
          >
            {t('Actualiser')}
          </Button>
        }
      />

      {/* Ce que le proprietaire cherche d'abord : ce qui reste a encaisser et ce qui est en retard.
          Les compteurs tiennent a deux par ligne sur telephone. */}
      {isPending && !data && <SkeletonStats rows={4} aria-label={t('Chargement des échéances')} />}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <StatCard
              helpId="portails.proprietaire.echeances.montants"
              title={t('Montant dû')}
              value={formatCurrency(data.summary.dueAmount)}
              icon={<DollarOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ fontSize: 18, color: '#faad14' }}
            />
          </Col>
          <Col xs={24} sm={12}>
            <StatCard
              title={t('Montant total')}
              value={formatCurrency(data.summary.totalAmount)}
              icon={<DollarOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
        </Row>
      )}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={12} lg={6}>
            <StatCard
              title={t('En retard')}
              value={data.summary.overdue.toString()}
              icon={<CalendarOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ fontSize: 18, color: '#ff4d4f' }}
            />
          </Col>
          <Col xs={12} lg={6}>
            <StatCard
              title={t('À payer')}
              value={data.summary.due.toString()}
              icon={<CalendarOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18, color: '#1890ff' }}
            />
          </Col>
          <Col xs={12} lg={6}>
            <StatCard
              title={t('Payées')}
              value={data.summary.paid.toString()}
              icon={<CalendarOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
          </Col>
          <Col xs={12} lg={6}>
            <StatCard
              helpId="portails.proprietaire.echeances.indicateurs"
              title={t('Total')}
              value={data.summary.total.toString()}
              icon={<CalendarOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
        </Row>
      )}

      {/* Liste : tableau sur grand ecran, cartes sur telephone. */}
      <DataView<InstallmentListItem>
        helpId="portails.proprietaire.echeances.tableau"
        aria-label={t('Liste des échéances')}
        {...search.dataViewProps}
        search={search.searchProps}
        items={installments}
        total={total}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={error}
        errorCause={queryError}
        onRetry={() => void refetch()}
        emptyDescription={t('Aucune échéance trouvée')}
        export={{
          filename: t('Liste des échéances'),
          fetchAll: () =>
            collectAllPages<InstallmentListItem>(async (page, limit) => {
              const response = await ownerPortalService.getInstallments({ ...search.filterParams, page, limit });
              const result = response.data?.data as InstallmentsData | undefined;
              return { items: result?.installments ?? [], total: result?.pagination?.total ?? 0 };
            })
        }}
        columns={columns}
        rowKey={row => row.id}
        renderCard={row => (
          <DataCard
            title={row.propertyAddress}
            subtitle={[row.tenantName, row.period].filter(Boolean).join(' · ')}
            status={getStatusTag(row.status)}
            highlight={formatCurrency(row.amount)}
            fields={[
              { label: t("Date d'échéance"), value: dayjs(row.dueDate).format('DD/MM/YYYY') },
              ...(Number(row.paidAmount || 0) > 0
                ? [{ label: t('Déjà payé'), value: formatCurrency(Number(row.paidAmount)) }]
                : []),
              ...(Number(row.penaltyAmount || 0) > 0
                ? [{ label: t('Pénalité'), value: formatCurrency(Number(row.penaltyAmount)) }]
                : [])
            ]}
          />
        )}
      />
    </Space>
  );
}
