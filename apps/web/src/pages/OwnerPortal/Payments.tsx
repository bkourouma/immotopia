import React, { useState } from 'react';
import { Card, Row, Col, Typography, Spin, Alert, Tag, Space, Button } from 'antd';
import { DollarOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ownerPortalService } from '../../services/ownerPortalService';
import type { OwnerPortalPagination } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import { PaymentDetailsModal } from '../../components/OwnerPortal/PaymentDetailsModal';
import { Table } from '../../components/primitives';
import { useListSearch } from '../../hooks/useListSearch';
import { STALE_TIME } from '../../lib/query-keys';
import { collectAllPages } from '../../utils/table-export/collect';
import { useOwnerPropertyOptions } from './useOwnerPropertyOptions';
import dayjs from 'dayjs';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

interface PaymentListItem {
  id: string;
  propertyAddress: string;
  tenantName: string;
  amount: number;
  date: Date | string;
  method: string;
  status: string;
}

interface PaymentSummary {
  total: number;
  totalAmount: number;
  thisMonth: number;
  thisYear: number;
}

interface PaymentsData {
  payments: PaymentListItem[];
  summary: PaymentSummary;
  pagination?: OwnerPortalPagination;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
};

const getStatusTag = (status: string) => {
  const statusConfig: Record<string, { color: string; text: string }> = {
    PENDING: { color: 'default', text: t('En attente') },
    SUCCESS: { color: 'green', text: t('Réussi') },
    FAILED: { color: 'red', text: t('Échoué') },
    CANCELED: { color: 'orange', text: t('Annulé') }
  };

  const config = statusConfig[status] || { color: 'default', text: status };
  return <Tag color={config.color}>{config.text}</Tag>;
};

const getMethodLabel = (method: string) => {
  const methodLabels: Record<string, string> = {
    MOBILE_MONEY: t('Mobile Money'),
    DIRECT_DEBIT: t('Prélèvement bancaire'),
    BANK_TRANSFER: t('Virement bancaire'),
    CASH: t('Espèces'),
    CHECK: t('Chèque'),
    CARD: t('Carte bancaire')
  };
  return methodLabels[method] || method;
};

export default function Payments() {
  const { options: propertyOptions } = useOwnerPropertyOptions();
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

  // Liste paginée par le serveur ; l'API ne trie pas (`sort: false`).
  const search = useListSearch({
    apiNames: { sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Bien, locataire, référence…') },
      {
        key: 'propertyId',
        type: 'select',
        label: t('Propriété'),
        primary: true,
        options: propertyOptions
      },
      {
        key: 'method',
        type: 'multiSelect',
        label: t('Méthode'),
        primary: true,
        options: [
          { value: 'MOBILE_MONEY', label: t('Mobile Money') },
          { value: 'DIRECT_DEBIT', label: t('Prélèvement bancaire') },
          { value: 'BANK_TRANSFER', label: t('Virement bancaire') },
          { value: 'CASH', label: t('Espèces') },
          { value: 'CHECK', label: t('Chèque') },
          { value: 'CARD', label: t('Carte bancaire') }
        ]
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
    queryKey: ['owner-portal', 'payments', search.apiParams],
    queryFn: async (): Promise<PaymentsData | null> => {
      const response = await ownerPortalService.getPayments(search.apiParams);
      return response.data?.success && response.data?.data ? (response.data.data as PaymentsData) : null;
    },
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });

  const error: string | null =
    actionError ||
    (queryError ? (queryError as any).response?.data?.message || t('Erreur lors du chargement des paiements') : null);
  const payments = data?.payments ?? [];
  const total = data?.pagination?.total ?? payments.length;

  const handleViewDetails = async (paymentId: string) => {
    try {
      setDetailsLoading(true);
      setActionError(null);
      setSelectedPaymentId(paymentId);
      const response = await ownerPortalService.getPaymentDetails(paymentId);
      if (response.data?.success && response.data?.data?.payment) {
        setPaymentDetails(response.data.data.payment);
        setDetailsModalVisible(true);
      }
    } catch (err: any) {
      setActionError(err.response?.data?.message || t('Erreur lors du chargement des détails'));
    } finally {
      setDetailsLoading(false);
    }
  };

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
      title: t('Montant'),
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => formatCurrency(amount)
    },
    {
      title: t('Date'),
      dataIndex: 'date',
      key: 'date',
      render: (date: Date | string) => {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dayjs(dateObj).format('DD/MM/YYYY HH:mm');
      }
    },
    {
      title: t('Méthode'),
      dataIndex: 'method',
      key: 'method',
      render: (method: string) => getMethodLabel(method)
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: any, record: PaymentListItem) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetails(record.id)}
          loading={detailsLoading && selectedPaymentId === record.id}
        >
          {t('Détails')}
        </Button>
      )
    }
  ];

  if (isPending && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement des paiements...')} />
      </div>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Paiements')}</Title>
          <Text type="secondary">{t('Historique des paiements reçus')}</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={() => refetch()}
          loading={isFetching}
          aria-label={t('Rafraîchir les paiements')}
        >
          {t('Actualiser')}
        </Button>
      </div>

      {/* Summary Cards (T107) : calculées par le serveur sur toutes les lignes filtrées */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Total')}
              value={data.summary.total.toString()}
              icon={<DollarOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Montant total')}
              value={formatCurrency(data.summary.totalAmount)}
              icon={<DollarOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Ce mois')}
              value={data.summary.thisMonth.toString()}
              icon={<DollarOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Cette année')}
              value={data.summary.thisYear.toString()}
              icon={<DollarOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ fontSize: 18 }}
            />
          </Col>
        </Row>
      )}

      {/* Payments Table (T106) */}
      <Card title={t('Historique des paiements')}>
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
          aria-label={t('Historique des paiements')}
          search={search.searchProps}
          exportFilename={t('Historique des paiements')}
          exportFetchAll={() =>
            collectAllPages<PaymentListItem>(async (page, limit) => {
              const response = await ownerPortalService.getPayments({ ...search.filterParams, page, limit });
              const result = response.data?.data as PaymentsData | undefined;
              return { items: result?.payments ?? [], total: result?.pagination?.total ?? 0 };
            })
          }
          scroll={{ x: 'max-content' }}
          columns={columns}
          dataSource={payments}
          rowKey="id"
          loading={isFetching}
          pagination={search.tablePagination(total)}
          locale={search.isFiltered ? undefined : { emptyText: t('Aucun paiement trouvé') }}
        />
      </Card>

      {/* Payment Details Modal (T108) */}
      <PaymentDetailsModal
        visible={detailsModalVisible}
        onClose={() => {
          setDetailsModalVisible(false);
          setPaymentDetails(null);
          setSelectedPaymentId(null);
        }}
        payment={paymentDetails}
        loading={detailsLoading}
      />
    </Space>
  );
}
