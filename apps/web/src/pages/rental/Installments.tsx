import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Space, Typography, Empty, Alert, Pagination, Select, Spin, Row, Col } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
  ThunderboltOutlined,
  CreditCardOutlined,
  ReloadOutlined,
  CalendarOutlined,
  PlusOutlined,
  DeleteOutlined,
  CloseOutlined
} from '@ant-design/icons';
import {
  listInstallments,
  generateInstallments,
  recalculateInstallmentStatuses,
  deleteAllInstallments,
  createPayment,
  allocatePayment,
  calculatePenalties,
  RentalInstallment,
  RentalInstallmentStatus,
  InstallmentFilters,
  RentalPaymentMethod,
  CreatePaymentRequest
} from '../../services/rental-service';
import { PaymentForm } from '../../components/rental/PaymentForm';
import { useConfirmAction } from '../../components/primitives';

const { Text, Title } = Typography;

interface InstallmentsProps {
  leaseId?: string;
  refreshTrigger?: number;
}

export const Installments: React.FC<InstallmentsProps> = ({ leaseId: propLeaseId, refreshTrigger }) => {
  const confirmAction = useConfirmAction();
  const { tenantId, leaseId: paramLeaseId } = useParams<{ tenantId: string; leaseId?: string }>();
  const leaseId = propLeaseId || paramLeaseId;
  const navigate = useNavigate();
  const [installments, setInstallments] = useState<RentalInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<RentalInstallment | null>(null);
  const [processingQuickPayment, setProcessingQuickPayment] = useState<string | null>(null);
  const [filters, setFilters] = useState<InstallmentFilters>({
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

  // Update filters when leaseId changes
  useEffect(() => {
    if (leaseId) {
      setFilters(prev => ({
        ...prev,
        leaseId: leaseId,
        page: 1 // Reset to first page when leaseId changes
      }));
    }
  }, [leaseId]);

  useEffect(() => {
    if (tenantId) {
      loadInstallments();
    }
  }, [tenantId, filters]);

  // Auto-recalculate installment statuses on mount
  useEffect(() => {
    if (tenantId && leaseId) {
      autoRecalculate();
    }
  }, [tenantId, leaseId]);

  // Refresh installments when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger && tenantId) {
      loadInstallments();
    }
  }, [refreshTrigger, tenantId]);

  const loadInstallments = async () => {
    if (!tenantId) return;

    // If we're in the context of a specific lease (propLeaseId or paramLeaseId exists),
    // we MUST have a leaseId to filter by. Don't load all installments.
    if (propLeaseId || paramLeaseId) {
      if (!leaseId) {
        // Don't load if we're in lease context but no leaseId
        setInstallments([]);
        setPagination({
          page: 1,
          limit: 50,
          total: 0,
          totalPages: 0
        });
        setLoading(false);
        return;
      }
    }

    // Use leaseId from props/params if available, otherwise use from filters
    const effectiveLeaseId = leaseId || filters.leaseId;

    setLoading(true);
    setError(null);
    try {
      const response = await listInstallments(tenantId, {
        ...filters,
        leaseId: effectiveLeaseId
      });
      if (response.success) {
        setInstallments(response.data);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des échéances');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des échéances');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!tenantId || !leaseId) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await generateInstallments(tenantId, leaseId);
      if (response.success) {
        await loadInstallments();
      } else {
        setError('Erreur lors de la génération des échéances');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la génération des échéances');
    } finally {
      setGenerating(false);
    }
  };

  const handleRecalculate = async () => {
    if (!tenantId || !leaseId) return;
    setLoading(true);
    try {
      // First, recalculate installment statuses
      await recalculateInstallmentStatuses(tenantId, leaseId);
      // Then, calculate penalties for overdue installments
      await calculatePenalties(tenantId);
      // Finally, reload installments
      await loadInstallments();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du recalcul');
    } finally {
      setLoading(false);
    }
  };

  const autoRecalculate = async () => {
    if (!tenantId || !leaseId) return;
    try {
      // First, recalculate installment statuses
      await recalculateInstallmentStatuses(tenantId, leaseId);
      // Then, calculate penalties for overdue installments
      await calculatePenalties(tenantId);
      // Finally, reload installments to show updated data
      await loadInstallments();
    } catch (err: any) {
      // Silently ignore errors for auto-recalculation
      console.error('Auto recalculation failed:', err);
    }
  };

  const handleDeleteAll = () => {
    if (!tenantId || !leaseId) return;

    confirmAction({
      title: 'Supprimer toutes les échéances de ce bail ?',
      description: 'Cette action est irréversible.',
      okText: 'Supprimer',
      danger: true,
      onConfirm: async () => {
        setDeleting(true);
        setError(null);
        try {
          const response = await deleteAllInstallments(tenantId, leaseId);
          if (response.success) {
            await loadInstallments();
          } else {
            setError('Erreur lors de la suppression des échéances');
          }
        } catch (err: any) {
          setError(err.response?.data?.message || 'Erreur lors de la suppression des échéances');
        } finally {
          setDeleting(false);
        }
      }
    });
  };

  const getStatusTag = (status: RentalInstallmentStatus) => {
    const statusMap: Partial<Record<RentalInstallmentStatus, { label: string; color: string }>> = {
      DRAFT: { label: 'Brouillon', color: 'default' },
      DUE: { label: 'Échéance', color: 'default' },
      PARTIAL: { label: 'Partiel', color: 'warning' },
      PAID: { label: 'Payé', color: 'success' },
      OVERDUE: { label: 'En retard', color: 'error' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
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

  const calculateTotalDue = (installment: RentalInstallment) => {
    return (
      Number(installment.amount_rent || 0) +
      Number(installment.amount_service || 0) +
      Number(installment.amount_other_fees || 0) +
      Number(installment.penalty_amount || 0)
    );
  };

  const handleQuickPayment = async (installment: RentalInstallment) => {
    if (!tenantId) return;

    const totalDue = calculateTotalDue(installment);
    const remaining = totalDue - Number(installment.amount_paid || 0);

    if (remaining <= 0) {
      setError('Cette Ã©chÃ©ance est dÃ©jÃ  Payée');
      return;
    }

    setProcessingQuickPayment(installment.id);
    setError(null);

    try {
      // Create payment with CASH method and current date
      const paymentData: CreatePaymentRequest = {
        leaseId: installment.lease_id,
        method: RentalPaymentMethod.CASH,
        amount: remaining,
        currency: installment.currency,
        idempotencyKey: `quick-payment-${installment.id}-${Date.now()}`
      };

      const paymentResponse = await createPayment(tenantId, paymentData);

      if (paymentResponse.success && paymentResponse.data) {
        // Allocate payment to the installment
        await allocatePayment(tenantId, paymentResponse.data.id, {
          installmentIds: [installment.id]
        });

        // Reload installments to show updated status
        await loadInstallments();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du paiement rapide');
    } finally {
      setProcessingQuickPayment(null);
    }
  };

  const handleOpenPaymentForm = (installment: RentalInstallment) => {
    console.log('Opening payment form for installment:', installment.id);
    setSelectedInstallment(installment);
    setShowPaymentForm(true);
    // Scroll to top to show the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreatePayment = async (data: CreatePaymentRequest) => {
    if (!tenantId || !selectedInstallment) return;

    setError(null);

    try {
      const paymentData: CreatePaymentRequest = {
        ...data,
        leaseId: selectedInstallment.lease_id,
        idempotencyKey: data.idempotencyKey || `payment-${selectedInstallment.id}-${Date.now()}`
      };

      const paymentResponse = await createPayment(tenantId, paymentData);

      if (paymentResponse.success && paymentResponse.data) {
        // Allocate payment to the selected installment
        await allocatePayment(tenantId, paymentResponse.data.id, {
          installmentIds: [selectedInstallment.id]
        });

        setShowPaymentForm(false);
        setSelectedInstallment(null);
        await loadInstallments();
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || "Erreur lors de l'enregistrement du paiement";
      setError(errorMessage);
      throw err;
    }
  };

  // If used as standalone page (not in tab)
  const isStandalone = !propLeaseId;

  const content = (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row gutter={[16, 16]} justify="space-between" align="middle">
          <Col xs={24} sm={24} md={12} lg={14}>
            <Title level={2} style={{ margin: 0 }}>
              Échéances
            </Title>
            <Text type="secondary">{leaseId ? 'Échéances du bail' : 'Gérez les échéances de location'}</Text>
          </Col>
          <Col xs={24} sm={24} md={12} lg={10}>
            <Space wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
              {leaseId && (
                <>
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleGenerate} loading={generating}>
                    Générer les échéances
                  </Button>
                  <Button icon={<ReloadOutlined />} onClick={handleRecalculate} disabled={loading}>
                    Recalculer
                  </Button>
                  {installments.length > 0 && (
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={handleDeleteAll}
                      loading={deleting}
                      disabled={loading}
                    >
                      Supprimer toutes les échéances
                    </Button>
                  )}
                </>
              )}
            </Space>
          </Col>
        </Row>

        {error && (
          <Alert message="Erreur" description={error} type="error" showIcon closable onClose={() => setError(null)} />
        )}

        {showPaymentForm && selectedInstallment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 rounded-full p-2">
                    <CreditCardOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Nouveau paiement</h2>
                    <p className="text-sm text-muted-foreground">
                      Échéance {selectedInstallment.period_month}/{selectedInstallment.period_year} - Date d'échéance:{' '}
                      {formatDate(selectedInstallment.due_date)}
                    </p>
                  </div>
                </div>
                <Button
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setShowPaymentForm(false);
                    setSelectedInstallment(null);
                  }}
                />
              </div>

              {/* Form Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6">
                <PaymentForm
                  tenantId={tenantId!}
                  leaseId={selectedInstallment.lease_id}
                  defaultAmount={(() => {
                    const totalDue = calculateTotalDue(selectedInstallment);
                    const remaining = totalDue - Number(selectedInstallment.amount_paid || 0);
                    return remaining > 0 ? remaining : undefined;
                  })()}
                  defaultCurrency={selectedInstallment.currency}
                  onSubmit={handleCreatePayment}
                  onCancel={() => {
                    setShowPaymentForm(false);
                    setSelectedInstallment(null);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <Space>
          <Select
            value={filters.status || 'all'}
            onChange={value =>
              setFilters({
                ...filters,
                status: value === 'all' ? undefined : (value as RentalInstallmentStatus),
                page: 1
              })
            }
            style={{ width: 180 }}
          >
            <Select.Option value="all">Tous les statuts</Select.Option>
            <Select.Option value="DUE">Échéance</Select.Option>
            <Select.Option value="PARTIAL">Partiel</Select.Option>
            <Select.Option value="PAID">Payé</Select.Option>
            <Select.Option value="OVERDUE">En retard</Select.Option>
          </Select>
          <Select
            value={filters.overdue ? 'true' : 'all'}
            onChange={value =>
              setFilters({
                ...filters,
                overdue: value === 'true',
                page: 1
              })
            }
            style={{ width: 180 }}
          >
            <Select.Option value="all">Toutes</Select.Option>
            <Select.Option value="true">En retard uniquement</Select.Option>
          </Select>
        </Space>

        {installments.length === 0 && !loading ? (
          <Empty
            description={
              leaseId
                ? 'Aucune échéance générée. Cliquez sur "Générer les échéances" pour commencer.'
                : 'Aucune échéance trouvée'
            }
          />
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <Table
                dataSource={installments}
                loading={loading}
                rowKey="id"
                scroll={{ x: 900 }}
                columns={[
                  {
                    title: 'Période',
                    key: 'period',
                    render: (_, record) => `${record.period_month}/${record.period_year}`
                  },
                  {
                    title: "Date d'échéance",
                    key: 'due_date',
                    render: (_, record) => formatDate(record.due_date)
                  },
                  {
                    title: 'Montant dû',
                    key: 'total_due',
                    render: (_, record) => {
                      const totalDue = calculateTotalDue(record);
                      return formatCurrency(totalDue, record.currency);
                    }
                  },
                  {
                    title: 'Payé',
                    key: 'amount_paid',
                    render: (_, record) => formatCurrency(record.amount_paid, record.currency)
                  },
                  {
                    title: 'Reste à payer',
                    key: 'remaining',
                    render: (_, record) => {
                      const totalDue = calculateTotalDue(record);
                      const remaining = totalDue - Number(record.amount_paid || 0);
                      return (
                        <Text type={remaining > 0 ? 'danger' : 'success'} strong={remaining > 0}>
                          {formatCurrency(remaining, record.currency)}
                        </Text>
                      );
                    }
                  },
                  {
                    title: 'Pénalités',
                    key: 'penalty',
                    render: (_, record) =>
                      record.penalty_amount > 0 ? formatCurrency(record.penalty_amount, record.currency) : '-'
                  },
                  {
                    title: 'Statut',
                    key: 'status',
                    render: (_, record) => getStatusTag(record.status)
                  },
                  {
                    title: 'Actions',
                    key: 'actions',
                    render: (_, record) => {
                      const totalDue = calculateTotalDue(record);
                      const remaining = totalDue - Number(record.amount_paid || 0);
                      return (
                        <Space>
                          <Button
                            type="text"
                            icon={<EyeOutlined />}
                            onClick={() => navigate(`/tenant/${tenantId}/rental/installments/${record.id}`)}
                          />
                          {remaining > 0 && (
                            <>
                              <Button
                                type="default"
                                icon={<ThunderboltOutlined />}
                                onClick={() => handleQuickPayment(record)}
                                loading={processingQuickPayment === record.id}
                                size="small"
                              >
                                Paiement rapide
                              </Button>
                              <Button
                                type="primary"
                                icon={<CreditCardOutlined />}
                                onClick={() => handleOpenPaymentForm(record)}
                                size="small"
                              >
                                Paiement
                              </Button>
                            </>
                          )}
                        </Space>
                      );
                    }
                  }
                ]}
                pagination={
                  pagination.totalPages > 1
                    ? {
                        current: pagination.page,
                        pageSize: pagination.limit,
                        total: pagination.total,
                        showSizeChanger: true,
                        showTotal: total => `Total ${total} échéances`,
                        onChange: (page, pageSize) => {
                          setFilters(prev => ({ ...prev, page, limit: pageSize }));
                        }
                      }
                    : false
                }
              />
            </div>
          </>
        )}
      </Space>
    </>
  );

  if (isStandalone) {
    return <>{content}</>;
  }

  return content;
};
