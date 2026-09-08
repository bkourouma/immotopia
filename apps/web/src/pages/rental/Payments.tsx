import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Space, Typography, Empty, Alert, Pagination, Select, Row, Col, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EyeOutlined, PlusOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import {
  listPayments,
  createPayment,
  allocatePayment,
  updatePaymentStatus,
  RentalPayment,
  RentalPaymentStatus,
  RentalPaymentMethod,
  PaymentFilters,
  CreatePaymentRequest,
  AllocatePaymentRequest
} from '../../services/rental-service';
import { PaymentForm } from '../../components/rental/PaymentForm';
import { AllocatePaymentForm } from '../../components/rental/AllocatePaymentForm';
import { PaymentDeclarationsList } from '../../components/rental/PaymentDeclarationsList';

const { Text, Title } = Typography;

interface PaymentsProps {
  leaseId?: string;
}

export const Payments: React.FC<PaymentsProps> = ({ leaseId: propLeaseId }) => {
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const navigate = useNavigate();
  const [payments, setPayments] = useState<RentalPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showAllocateForm, setShowAllocateForm] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<RentalPayment | null>(null);
  const [filters, setFilters] = useState<PaymentFilters>({
    leaseId: leaseId,
    page: 1,
    limit: 50
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    if (tenantId) {
      loadPayments();
    }
  }, [tenantId, filters, leaseId]);

  const loadPayments = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listPayments(tenantId, {
        ...filters,
        leaseId: leaseId || filters.leaseId
      });
      if (response.success) {
        setPayments(response.data);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des paiements');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des paiements');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePayment = async (data: CreatePaymentRequest) => {
    if (!tenantId) return;
    // Errors propagate to the form, which renders them.
    await createPayment(tenantId, data);
    setShowPaymentForm(false);
    await loadPayments();
  };

  const handleAllocate = (payment: RentalPayment) => {
    setSelectedPayment(payment);
    setShowAllocateForm(true);
  };

  const handleAllocatePayment = async (data: AllocatePaymentRequest) => {
    if (!tenantId || !selectedPayment) return;
    // Errors propagate to the form, which renders them.
    await allocatePayment(tenantId, selectedPayment.id, data);
    setShowAllocateForm(false);
    setSelectedPayment(null);
    // Redirect to installments page after successful allocation
    navigate(`/tenant/${tenantId}/rental/installments`);
  };

  const handleStatusChange = async (paymentId: string, newStatus: RentalPaymentStatus) => {
    if (!tenantId) return;
    try {
      await updatePaymentStatus(tenantId, paymentId, newStatus);
      await loadPayments();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la mise à jour du statut');
    }
  };

  const getStatusTag = (status: RentalPaymentStatus) => {
    const statusMap: Record<RentalPaymentStatus, { label: string; color: string }> = {
      PENDING: { label: 'En attente', color: 'default' },
      SUCCESS: { label: 'Réussi', color: 'success' },
      FAILED: { label: 'Échoué', color: 'error' },
      CANCELED: { label: 'Annulé', color: 'default' },
      REFUNDED: { label: 'Remboursé', color: 'warning' },
      PARTIALLY_REFUNDED: { label: 'Partiellement remboursé', color: 'warning' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const getMethodLabel = (method: RentalPaymentMethod) => {
    const methodMap: Record<RentalPaymentMethod, string> = {
      CASH: 'Espèces',
      BANK_TRANSFER: 'Virement bancaire',
      CHECK: 'Chèque',
      MOBILE_MONEY: 'Mobile Money',
      CARD: 'Carte bancaire',
      OTHER: 'Autre'
    };
    return methodMap[method] || method;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency
    }).format(amount);
  };

  // If used as standalone page (not in tab)
  const isStandalone = !propLeaseId;

  const paymentsTabContent = (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {error && (
        <Alert message="Erreur" description={error} type="error" showIcon closable onClose={() => setError(null)} />
      )}

      {showPaymentForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <PaymentForm
            tenantId={tenantId!}
            leaseId={leaseId}
            onSubmit={handleCreatePayment}
            onCancel={() => setShowPaymentForm(false)}
          />
        </div>
      )}

      {showAllocateForm && selectedPayment && (
        <div className="bg-white rounded-lg shadow p-6">
          <AllocatePaymentForm
            tenantId={tenantId!}
            payment={selectedPayment}
            onSubmit={handleAllocatePayment}
            onCancel={() => {
              setShowAllocateForm(false);
              setSelectedPayment(null);
            }}
          />
        </div>
      )}

      <Space>
        <Select
          value={filters.status || 'all'}
          onChange={value =>
            setFilters({
              ...filters,
              status: value === 'all' ? undefined : (value as RentalPaymentStatus),
              page: 1
            })
          }
          style={{ width: 180 }}
        >
          <Select.Option value="all">Tous les statuts</Select.Option>
          <Select.Option value="PENDING">En attente</Select.Option>
          <Select.Option value="SUCCESS">Réussi</Select.Option>
          <Select.Option value="FAILED">Échoué</Select.Option>
          <Select.Option value="CANCELED">Annulé</Select.Option>
        </Select>
      </Space>

      {payments.length === 0 && !loading ? (
        <Empty description="Aucun paiement trouvé" />
      ) : (
        <Table
          dataSource={payments}
          loading={loading}
          rowKey="id"
          scroll={{ x: 'max-content' }}
          columns={[
            {
              title: 'Date',
              key: 'date',
              render: (_, record) => formatDate(record.initiated_at)
            },
            {
              title: 'Montant',
              key: 'amount',
              render: (_, record) => formatCurrency(record.amount, record.currency)
            },
            {
              title: 'Alloué',
              key: 'allocated',
              render: (_, record) => {
                const toInstallments =
                  record.allocations?.reduce((sum, alloc) => sum + Number(alloc.amount || 0), 0) || 0;
                const toDeposit = record.depositMovements?.reduce((sum, m) => sum + Number(m.amount || 0), 0) || 0;
                const allocatedAmount = toInstallments + toDeposit;
                return (
                  <Text type={allocatedAmount > 0 ? 'success' : 'secondary'} strong={allocatedAmount > 0}>
                    {formatCurrency(allocatedAmount, record.currency)}
                  </Text>
                );
              }
            },
            {
              title: 'Restant',
              key: 'remaining',
              render: (_, record) => {
                const toInstallments =
                  record.allocations?.reduce((sum, alloc) => sum + Number(alloc.amount || 0), 0) || 0;
                const toDeposit = record.depositMovements?.reduce((sum, m) => sum + Number(m.amount || 0), 0) || 0;
                const allocatedAmount = toInstallments + toDeposit;
                const remainingAmount = record.amount - allocatedAmount;
                return (
                  <Text type={remainingAmount > 0 ? 'warning' : 'secondary'} strong={remainingAmount > 0}>
                    {formatCurrency(remainingAmount, record.currency)}
                  </Text>
                );
              }
            },
            {
              title: 'Méthode',
              key: 'method',
              render: (_, record) => getMethodLabel(record.method)
            },
            {
              title: 'Statut',
              key: 'status',
              render: (_, record) => getStatusTag(record.status)
            },
            {
              title: 'Actions',
              key: 'actions',
              render: (_, record) => (
                <Space>
                  <Button
                    type="text"
                    icon={<EyeOutlined />}
                    onClick={() => navigate(`/tenant/${tenantId}/rental/payments/${record.id}`)}
                  />
                  {record.status === 'PENDING' && <Button onClick={() => handleAllocate(record)}>Allouer</Button>}
                </Space>
              )
            }
          ]}
          pagination={
            pagination.totalPages > 1
              ? {
                  current: pagination.page,
                  pageSize: pagination.limit,
                  total: pagination.total,
                  showSizeChanger: true,
                  showTotal: total => `Total ${total} paiements`,
                  onChange: (page, pageSize) => {
                    setFilters(prev => ({ ...prev, page, limit: pageSize }));
                  }
                }
              : false
          }
        />
      )}
    </Space>
  );

  const content = (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row gutter={[16, 16]} justify="space-between" align="middle">
          <Col xs={24} sm={24} md={12} lg={14}>
            <Title level={2} style={{ margin: 0 }}>
              Paiements
            </Title>
            <Text type="secondary">Gérez les paiements de location et validez les déclarations</Text>
          </Col>
          <Col xs={24} sm={24} md={12} lg={10}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowPaymentForm(true)}>
                Nouveau paiement
              </Button>
            </div>
          </Col>
        </Row>

        <Tabs
          defaultActiveKey="payments"
          items={[
            {
              key: 'payments',
              label: 'Paiements',
              children: paymentsTabContent
            },
            {
              key: 'declarations',
              label: 'Déclarations en attente',
              children: tenantId ? (
                <PaymentDeclarationsList tenantId={tenantId} leaseId={leaseId} onApproveSuccess={loadPayments} />
              ) : null
            }
          ]}
        />
      </Space>
    </>
  );

  if (isStandalone) {
    return <>{content}</>;
  }

  return content;
};
