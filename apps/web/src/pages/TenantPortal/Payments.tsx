import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Spin,
  Alert,
  Table,
  Tag,
  Button,
  Space,
  Select,
  DatePicker,
  Statistic,
  Modal,
  Descriptions,
  Empty,
  Tabs,
  Collapse
} from 'antd';
import { DollarOutlined, CalendarOutlined, EyeOutlined, FilterOutlined, PlusOutlined } from '@ant-design/icons';
import { tenantPortalService } from '../../services/tenantPortalService';
import InstallmentDetails from '../../components/TenantPortal/InstallmentDetails';
import PaymentDeclarationModal from '../../components/TenantPortal/PaymentDeclarationModal';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface InstallmentItem {
  id: string;
  period: string;
  dueDate: string;
  amount: number;
  paid: number;
  balance: number;
  status: string;
  items: any[];
  payments: any[];
}

interface InstallmentsData {
  installments: InstallmentItem[];
  summary: {
    total: number;
    paid: number;
    due: number;
    overdue: number;
    partial: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function TenantPayments() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InstallmentsData | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [selectedInstallment, setSelectedInstallment] = useState<string | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [declarationModalVisible, setDeclarationModalVisible] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  // Payment history state
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryError, setPaymentHistoryError] = useState<string | null>(null);
  const [paymentHistoryData, setPaymentHistoryData] = useState<any>(null);
  const [paymentHistoryFilters, setPaymentHistoryFilters] = useState<{
    startDate?: string;
    endDate?: string;
    method?: string;
  }>({});
  const [paymentHistoryPagination, setPaymentHistoryPagination] = useState({ current: 1, pageSize: 20 });

  const loadRef = useRef<{
    loadInstallments: (silencieux?: boolean) => void;
    loadPaymentHistory: (silencieux?: boolean) => void;
  } | null>(null);
  /** Horodatage de la dernière revalidation, pour le délai de garde ci-dessous. */
  const derniereRevalidation = useRef(Date.now());

  /**
   * @param silencieux Revalidation en arrière-plan : la donnée affichée reste
   *   à l'écran, sans repasser par le squelette.
   */
  const loadInstallments = async (silencieux = false) => {
    try {
      if (!silencieux) setLoading(true);
      setError(null);

      const params: any = {
        page: pagination.current,
        limit: pagination.pageSize
      };

      if (statusFilter) {
        params.status = statusFilter;
      }

      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }

      const response = await tenantPortalService.getInstallments(params);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError('Erreur lors du chargement des échéances');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des échéances');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return dayjs(dateString).format('DD/MM/YYYY');
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      PAID: { label: 'Payé', color: 'success' },
      DUE: { label: 'Dû', color: 'warning' },
      OVERDUE: { label: 'En retard', color: 'error' },
      PARTIAL: { label: 'Partiel', color: 'processing' },
      DRAFT: { label: 'Brouillon', color: 'default' },
      CANCELED: { label: 'Annulé', color: 'default' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const handleViewDetails = (installmentId: string) => {
    setSelectedInstallment(installmentId);
    setDetailsModalVisible(true);
  };

  const handleCloseDetails = () => {
    setDetailsModalVisible(false);
    setSelectedInstallment(null);
  };

  const handleTableChange = (newPagination: any) => {
    setPagination({
      current: newPagination.current,
      pageSize: newPagination.pageSize
    });
  };

  /** @param silencieux Voir `loadInstallments`. */
  const loadPaymentHistory = async (silencieux = false) => {
    try {
      if (!silencieux) setPaymentHistoryLoading(true);
      setPaymentHistoryError(null);

      const params: any = {
        page: paymentHistoryPagination.current,
        limit: paymentHistoryPagination.pageSize
      };

      if (paymentHistoryFilters.startDate) {
        params.startDate = paymentHistoryFilters.startDate;
      }
      if (paymentHistoryFilters.endDate) {
        params.endDate = paymentHistoryFilters.endDate;
      }
      if (paymentHistoryFilters.method) {
        params.method = paymentHistoryFilters.method;
      }

      const response = await tenantPortalService.getPaymentHistory(params);
      if (response.data?.success && response.data?.data) {
        setPaymentHistoryData(response.data.data);
      } else {
        setPaymentHistoryError("Erreur lors du chargement de l'historique");
      }
    } catch (err: any) {
      setPaymentHistoryError(err.response?.data?.message || "Erreur lors du chargement de l'historique");
    } finally {
      setPaymentHistoryLoading(false);
    }
  };

  loadRef.current = { loadInstallments, loadPaymentHistory };

  useEffect(() => {
    loadInstallments();
  }, [statusFilter, dateRange, pagination.current, pagination.pageSize]);

  useEffect(() => {
    loadPaymentHistory();
  }, [paymentHistoryFilters, paymentHistoryPagination.current, paymentHistoryPagination.pageSize]);

  /**
   * Retour sur l'onglet : revalidation en arrière-plan (REFONTE_UI_UX.md §8.4).
   *
   * Deux corrections par rapport à l'ancienne version :
   *
   * 1. **Le chargement est silencieux.** Il posait `loading = true`, ce qui
   *    renvoyait l'écran à son squelette à chaque retour d'onglet : la mise en
   *    page sautait et le lecteur perdait sa ligne, pour une donnée qui la
   *    plupart du temps n'avait pas changé.
   * 2. **Un délai de garde.** L'événement se déclenche à chaque va-et-vient
   *    entre onglets ou applications. Sans ce seuil, consulter une notification
   *    et revenir relançait deux requêtes complètes. Trente secondes, la même
   *    fraîcheur que `STALE_TIME.list`.
   */
  useEffect(() => {
    const REVALIDATION_MIN_MS = 30_000;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const maintenant = Date.now();
      if (maintenant - derniereRevalidation.current < REVALIDATION_MIN_MS) return;
      derniereRevalidation.current = maintenant;
      void loadRef.current?.loadInstallments(true);
      void loadRef.current?.loadPaymentHistory(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      CASH: 'Espèces',
      BANK_TRANSFER: 'Virement bancaire',
      MOBILE_MONEY: 'Mobile Money',
      CHECK: 'Chèque',
      CARD: 'Carte bancaire',
      OTHER: 'Autre'
    };
    return labels[method] || method;
  };

  const handlePaymentHistoryTableChange = (newPagination: any) => {
    setPaymentHistoryPagination({
      current: newPagination.current,
      pageSize: newPagination.pageSize
    });
  };

  const columns = [
    {
      title: 'Période',
      dataIndex: 'period',
      key: 'period',
      render: (period: string) => <Text strong>{period}</Text>
    },
    {
      title: "Date d'échéance",
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (date: string) => (
        <Space>
          <CalendarOutlined />
          {formatDate(date)}
        </Space>
      ),
      sorter: (a: InstallmentItem, b: InstallmentItem) => dayjs(a.dueDate).unix() - dayjs(b.dueDate).unix()
    },
    {
      title: 'Montant total',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => <Text strong>{formatCurrency(amount)}</Text>,
      sorter: (a: InstallmentItem, b: InstallmentItem) => a.amount - b.amount
    },
    {
      title: 'Payé',
      dataIndex: 'paid',
      key: 'paid',
      render: (paid: number) => formatCurrency(paid),
      sorter: (a: InstallmentItem, b: InstallmentItem) => a.paid - b.paid
    },
    {
      title: 'Solde',
      dataIndex: 'balance',
      key: 'balance',
      render: (balance: number) => <Text type={balance > 0 ? 'danger' : 'success'}>{formatCurrency(balance)}</Text>,
      sorter: (a: InstallmentItem, b: InstallmentItem) => a.balance - b.balance
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: InstallmentItem) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => handleViewDetails(record.id)}>
          Détails
        </Button>
      )
    }
  ];

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement des échéances..." />
      </div>
    );
  }

  if (error && !data) {
    return <Alert message="Erreur" description={error} type="error" showIcon />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2}>Paiements et échéances</Title>
          <Text type="secondary">Suivez vos échéances et l'historique de vos paiements</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setDeclarationModalVisible(true)}>
          Déclarer un paiement
        </Button>
      </div>

      {/* Summary Cards (T054) */}
      {data?.summary && (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="Total échéances" value={data.summary.total} prefix={<DollarOutlined />} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Payées"
                value={data.summary.paid}
                valueStyle={{ color: '#3f8600' }}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="En attente"
                value={data.summary.due}
                valueStyle={{ color: '#faad14' }}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="En retard"
                value={data.summary.overdue}
                valueStyle={{ color: '#cf1322' }}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Filters (T052, T053) */}
      <Card>
        <Space size="middle" wrap>
          <Space>
            <FilterOutlined />
            <Text strong>Filtres :</Text>
          </Space>
          <Select
            placeholder="Statut"
            allowClear
            style={{ width: 150 }}
            value={statusFilter}
            onChange={value => setStatusFilter(value)}
          >
            <Select.Option value="PAID">Payé</Select.Option>
            <Select.Option value="DUE">Dû</Select.Option>
            <Select.Option value="OVERDUE">En retard</Select.Option>
            <Select.Option value="PARTIAL">Partiel</Select.Option>
            <Select.Option value="DRAFT">Brouillon</Select.Option>
          </Select>
          <RangePicker
            placeholder={['Date début', 'Date fin']}
            value={dateRange}
            onChange={dates => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            format="DD/MM/YYYY"
          />
          {(statusFilter || dateRange) && (
            <Button
              onClick={() => {
                setStatusFilter(undefined);
                setDateRange(null);
              }}
            >
              Réinitialiser
            </Button>
          )}
        </Space>
      </Card>

      {/* Tabs for Installments and Payment History */}
      <Tabs
        defaultActiveKey="installments"
        items={[
          {
            key: 'installments',
            label: 'Échéances',
            children: (
              <Card
                title={
                  <>
                    <DollarOutlined /> Liste des échéances
                  </>
                }
              >
                {data && data.installments.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <Table
                      columns={columns}
                      dataSource={data.installments}
                      rowKey="id"
                      loading={loading}
                      scroll={{ x: 800 }}
                      pagination={{
                        current: pagination.current,
                        pageSize: pagination.pageSize,
                        total: data.pagination.total,
                        showSizeChanger: true,
                        showTotal: total => `Total: ${total} échéances`
                      }}
                      onChange={handleTableChange}
                    />
                  </div>
                ) : (
                  <Empty description="Aucune échéance trouvée" />
                )}
              </Card>
            )
          },
          {
            key: 'payments',
            label: 'Historique des paiements',
            children: (
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {/* Payment History Filters (T075) */}
                <Card>
                  <Space size="middle" wrap>
                    <Space>
                      <FilterOutlined />
                      <Text strong>Filtres :</Text>
                    </Space>
                    <Select
                      placeholder="Méthode de paiement"
                      allowClear
                      style={{ width: 200 }}
                      value={paymentHistoryFilters.method}
                      onChange={value => setPaymentHistoryFilters({ ...paymentHistoryFilters, method: value })}
                    >
                      <Select.Option value="CASH">Espèces</Select.Option>
                      <Select.Option value="BANK_TRANSFER">Virement bancaire</Select.Option>
                      <Select.Option value="MOBILE_MONEY">Mobile Money</Select.Option>
                      <Select.Option value="CHECK">Chèque</Select.Option>
                      <Select.Option value="CARD">Carte bancaire</Select.Option>
                      <Select.Option value="OTHER">Autre</Select.Option>
                    </Select>
                    <RangePicker
                      placeholder={['Date début', 'Date fin']}
                      onChange={dates => {
                        if (dates && dates[0] && dates[1]) {
                          setPaymentHistoryFilters({
                            ...paymentHistoryFilters,
                            startDate: dates[0].format('YYYY-MM-DD'),
                            endDate: dates[1].format('YYYY-MM-DD')
                          });
                        } else {
                          setPaymentHistoryFilters({
                            ...paymentHistoryFilters,
                            startDate: undefined,
                            endDate: undefined
                          });
                        }
                      }}
                      format="DD/MM/YYYY"
                    />
                    {(paymentHistoryFilters.method || paymentHistoryFilters.startDate) && (
                      <Button
                        onClick={() => {
                          setPaymentHistoryFilters({});
                        }}
                      >
                        Réinitialiser
                      </Button>
                    )}
                  </Space>
                </Card>

                {/* Payment History Table (T073, T074) */}
                <Card
                  title={
                    <>
                      <DollarOutlined /> Historique des paiements
                    </>
                  }
                >
                  {paymentHistoryError ? (
                    <Alert message="Erreur" description={paymentHistoryError} type="error" showIcon />
                  ) : paymentHistoryData && paymentHistoryData.payments.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <Table
                        scroll={{ x: 1000 }}
                        columns={[
                          {
                            title: 'Date',
                            dataIndex: 'succeededAt',
                            key: 'date',
                            render: (_: string | null, record: any) => {
                              const date = record.succeededAt || record.initiatedAt;
                              return (
                                <Space>
                                  <CalendarOutlined />
                                  {date ? formatDate(date) : '-'}
                                  {record.isDeclaration && (
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                      (déclaration)
                                    </Text>
                                  )}
                                </Space>
                              );
                            },
                            sorter: (a: any, b: any) => {
                              const dateA =
                                a.succeededAt || a.initiatedAt ? dayjs(a.succeededAt || a.initiatedAt).unix() : 0;
                              const dateB =
                                b.succeededAt || b.initiatedAt ? dayjs(b.succeededAt || b.initiatedAt).unix() : 0;
                              return dateA - dateB;
                            }
                          },
                          {
                            title: 'Montant',
                            dataIndex: 'amount',
                            key: 'amount',
                            render: (amount: number) => <Text strong>{formatCurrency(amount)}</Text>,
                            sorter: (a: any, b: any) => a.amount - b.amount
                          },
                          {
                            title: 'Méthode',
                            dataIndex: 'method',
                            key: 'method',
                            render: (method: string) => getPaymentMethodLabel(method)
                          },
                          {
                            title: 'Référence',
                            dataIndex: 'reference',
                            key: 'reference',
                            render: (ref: string | null) => ref || '-'
                          },
                          {
                            title: 'Statut',
                            dataIndex: 'status',
                            key: 'status',
                            render: (status: string, record: any) => {
                              const declStatus = record.declarationStatus || status;
                              const label =
                                declStatus === 'SUCCESS' || declStatus === 'APPROVED'
                                  ? 'Réussi'
                                  : declStatus === 'PENDING'
                                    ? 'En attente'
                                    : declStatus === 'REJECTED'
                                      ? 'Rejetée'
                                      : status;
                              const color =
                                declStatus === 'SUCCESS' || declStatus === 'APPROVED'
                                  ? 'success'
                                  : declStatus === 'PENDING'
                                    ? 'warning'
                                    : declStatus === 'REJECTED'
                                      ? 'error'
                                      : 'default';
                              return <Tag color={color}>{label}</Tag>;
                            }
                          },
                          {
                            title: 'Alloué',
                            dataIndex: 'allocatedAmount',
                            key: 'allocated',
                            render: (amount: number) => formatCurrency(amount),
                            align: 'right' as const
                          },
                          {
                            title: 'Non alloué',
                            dataIndex: 'unallocatedAmount',
                            key: 'unallocated',
                            render: (amount: number) => (
                              <Text type={amount > 0 ? 'warning' : 'success'}>{formatCurrency(amount)}</Text>
                            ),
                            align: 'right' as const
                          }
                        ]}
                        dataSource={paymentHistoryData.payments}
                        rowKey={(r: any) => (r.isDeclaration ? `decl-${r.id}` : r.id)}
                        loading={paymentHistoryLoading}
                        pagination={{
                          current: paymentHistoryPagination.current,
                          pageSize: paymentHistoryPagination.pageSize,
                          total: paymentHistoryData.pagination?.total ?? paymentHistoryData.payments.length,
                          showSizeChanger: true,
                          showTotal: total =>
                            `Total: ${total} élément${total !== 1 ? 's' : ''} (paiements et déclarations)`
                        }}
                        onChange={handlePaymentHistoryTableChange}
                        expandable={{
                          expandedRowRender: (record: any) => {
                            if (!record.allocations || record.allocations.length === 0) {
                              return <Text type="secondary">Aucune allocation</Text>;
                            }
                            return (
                              <Table
                                columns={[
                                  {
                                    title: 'Échéance',
                                    dataIndex: ['installment', 'period'],
                                    key: 'period',
                                    render: (period: string | null, row: any) =>
                                      row?.installment?.period ?? period ?? '-'
                                  },
                                  {
                                    title: "Date d'échéance",
                                    dataIndex: ['installment', 'dueDate'],
                                    key: 'dueDate',
                                    render: (date: string | null, row: any) =>
                                      (row?.installment?.dueDate ?? date)
                                        ? formatDate(row?.installment?.dueDate ?? date)
                                        : '-'
                                  },
                                  {
                                    title: 'Montant alloué',
                                    dataIndex: 'amount',
                                    key: 'amount',
                                    render: (amount: number) => formatCurrency(amount),
                                    align: 'right' as const
                                  }
                                ]}
                                dataSource={record.allocations}
                                rowKey="id"
                                pagination={false}
                                size="small"
                              />
                            );
                          },
                          rowExpandable: (record: any) => record.allocations && record.allocations.length > 0
                        }}
                      />
                    </div>
                  ) : (
                    <Empty description="Aucun paiement trouvé" />
                  )}
                </Card>

                {/* Total Paid Summary */}
                {paymentHistoryData && (
                  <Card>
                    <Statistic
                      title="Total payé (tous les paiements)"
                      value={paymentHistoryData.totalPaid}
                      prefix={<DollarOutlined />}
                      formatter={value => formatCurrency(Number(value))}
                    />
                  </Card>
                )}
              </Space>
            )
          }
        ]}
      />

      {/* Installment Details Modal */}
      <Modal
        title="Détails de l'échéance"
        open={detailsModalVisible}
        onCancel={handleCloseDetails}
        footer={null}
        width={800}
        destroyOnClose
      >
        {selectedInstallment && <InstallmentDetails installmentId={selectedInstallment} />}
      </Modal>

      {/* Payment Declaration Modal (T069) */}
      <PaymentDeclarationModal
        open={declarationModalVisible}
        onCancel={() => setDeclarationModalVisible(false)}
        onSuccess={() => {
          loadInstallments();
          loadPaymentHistory();
        }}
      />
    </Space>
  );
}
