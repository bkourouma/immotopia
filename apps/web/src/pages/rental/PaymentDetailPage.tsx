import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  App,
  Button,
  Tag,
  Space,
  Typography,
  Card,
  Descriptions,
  Select,
  Modal,
  Alert,
  Spin,
  Empty,
  Row,
  Col
} from 'antd';
import {
  ArrowLeftOutlined,
  DollarOutlined,
  CreditCardOutlined,
  CalendarOutlined,
  FileTextOutlined,
  CloseOutlined
} from '@ant-design/icons';
import {
  getPayment,
  RentalPayment,
  RentalPaymentStatus,
  RentalDepositMovementType,
  allocatePayment,
  AllocatePaymentRequest,
  updatePaymentStatus
} from '../../services/rental-service';
import { AllocatePaymentForm } from '../../components/rental/AllocatePaymentForm';

const { Title, Text } = Typography;

export const PaymentDetailPage: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId, paymentId } = useParams<{ tenantId: string; paymentId: string }>();
  const navigate = useNavigate();
  const [payment, setPayment] = useState<RentalPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllocateForm, setShowAllocateForm] = useState(false);
  const [isAllocating, setIsAllocating] = useState(false);

  useEffect(() => {
    if (tenantId && paymentId) {
      loadPayment();
    }
  }, [tenantId, paymentId]);

  const loadPayment = async () => {
    if (!tenantId || !paymentId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getPayment(tenantId, paymentId);
      if (response.success) {
        setPayment(response.data);
      } else {
        setError('Erreur lors du chargement du paiement');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement du paiement');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: RentalPaymentStatus) => {
    if (!tenantId || !paymentId) return;
    try {
      await updatePaymentStatus(tenantId, paymentId, newStatus);
      await loadPayment();
      message.success('Statut mis à jour avec succès');
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Erreur lors de la mise à jour du statut';
      setError(errorMessage);
      message.error(errorMessage);
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

  const getMethodLabel = (method: string) => {
    const methodMap: Record<string, string> = {
      CASH: 'Espèces',
      BANK_TRANSFER: 'Virement bancaire',
      CHECK: 'Chèque',
      MOBILE_MONEY: 'Mobile Money',
      CARD: 'Carte bancaire',
      OTHER: 'Autre'
    };
    return methodMap[method] || method;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency
    }).format(amount);
  };

  const getDepositMovementTypeLabel = (type: RentalDepositMovementType | string) => {
    const labels: Record<string, string> = {
      [RentalDepositMovementType.COLLECT]: 'Collecte (dépôt de garantie)',
      [RentalDepositMovementType.HOLD]: 'Mise en retenue',
      [RentalDepositMovementType.RELEASE]: 'Libération',
      [RentalDepositMovementType.REFUND]: 'Remboursement',
      [RentalDepositMovementType.FORFEIT]: 'Confiscation',
      [RentalDepositMovementType.ADJUSTMENT]: 'Ajustement'
    };
    return labels[type] || type;
  };

  const handleAllocatePayment = async (data: AllocatePaymentRequest) => {
    if (!tenantId || !paymentId) return;
    setIsAllocating(true);
    setError(null);
    try {
      await allocatePayment(tenantId, paymentId, data);
      setShowAllocateForm(false);
      await loadPayment();
      message.success('Paiement alloué avec succès');
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || "Erreur lors de l'allocation du paiement";
      setError(errorMessage);
      message.error(errorMessage);
      throw err;
    } finally {
      setIsAllocating(false);
    }
  };

  // Allocated = to installments + to deposit (e.g. collect)
  const toInstallments = payment?.allocations?.reduce((sum, alloc) => sum + Number(alloc.amount || 0), 0) || 0;
  const toDeposit = payment?.depositMovements?.reduce((sum, m) => sum + Number(m.amount || 0), 0) || 0;
  const allocatedAmount = toInstallments + toDeposit;
  const availableAmount = (payment?.amount || 0) - allocatedAmount;

  if (loading) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin size="large" />
        </div>
      </>
    );
  }

  if (error || !payment) {
    return (
      <>
        <Alert message="Erreur" description={error || 'Paiement non trouvé'} type="error" showIcon />
      </>
    );
  }

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {error && (
          <Alert message="Erreur" description={error} type="error" showIcon closable onClose={() => setError(null)} />
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => {
                if (payment.lease_id) {
                  navigate(`/tenant/${tenantId}/rental/leases/${payment.lease_id}`);
                } else {
                  navigate(`/tenant/${tenantId}/rental/payments`);
                }
              }}
            >
              Retour
            </Button>
            <div>
              <Title level={2} style={{ margin: 0 }}>
                Paiement #{payment.id.slice(0, 8)}
              </Title>
              <Text type="secondary">Détails du paiement</Text>
            </div>
          </Space>
          <Select
            value={payment.status}
            onChange={value => handleStatusChange(value as RentalPaymentStatus)}
            style={{ width: 180 }}
          >
            <Select.Option value="PENDING">En attente</Select.Option>
            <Select.Option value="SUCCESS">Réussi</Select.Option>
            <Select.Option value="FAILED">Échoué</Select.Option>
            <Select.Option value="CANCELED">Annulé</Select.Option>
          </Select>
        </div>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <DollarOutlined />
                  <span>Informations financières</span>
                </Space>
              }
            >
              <Descriptions column={1} bordered>
                <Descriptions.Item label="Montant">
                  <Text strong>{formatCurrency(payment.amount, payment.currency)}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Montant alloué">
                  {formatCurrency(allocatedAmount, payment.currency)}
                </Descriptions.Item>
                <Descriptions.Item label="Montant disponible">
                  <Text strong>{formatCurrency(availableAmount, payment.currency)}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Méthode de paiement">{getMethodLabel(payment.method)}</Descriptions.Item>
                <Descriptions.Item label="Statut">{getStatusTag(payment.status)}</Descriptions.Item>
                {payment.mm_operator && (
                  <Descriptions.Item label="Opérateur Mobile Money">{payment.mm_operator}</Descriptions.Item>
                )}
                {payment.mm_phone && (
                  <Descriptions.Item label="Numéro de téléphone">{payment.mm_phone}</Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <CalendarOutlined />
                  <span>Dates</span>
                </Space>
              }
            >
              <Descriptions column={1} bordered>
                <Descriptions.Item label="Date d'initiation">{formatDate(payment.initiated_at)}</Descriptions.Item>
                {payment.succeeded_at && (
                  <Descriptions.Item label="Date de succès">{formatDate(payment.succeeded_at)}</Descriptions.Item>
                )}
                {payment.failed_at && (
                  <Descriptions.Item label="Date d'échec">{formatDate(payment.failed_at)}</Descriptions.Item>
                )}
                {payment.canceled_at && (
                  <Descriptions.Item label="Date d'annulation">{formatDate(payment.canceled_at)}</Descriptions.Item>
                )}
              </Descriptions>
            </Card>
          </Col>
        </Row>

        <Card
          title={
            <Space>
              <FileTextOutlined />
              <span>Utilisation du paiement</span>
            </Space>
          }
          extra={
            payment.lease_id && availableAmount > 0 && payment.status === 'SUCCESS' ? (
              <Button type="primary" onClick={() => setShowAllocateForm(true)}>
                Allouer aux échéances
              </Button>
            ) : null
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            {/* Allocations aux échéances */}
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                Allocations aux échéances
              </Text>
              {payment.allocations && payment.allocations.length > 0 ? (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {payment.allocations.map(allocation => (
                    <Card key={allocation.id} size="small" style={{ border: '1px solid #d9d9d9' }}>
                      <Row justify="space-between" align="middle">
                        <Col flex="auto">
                          {allocation.installment ? (
                            <>
                              <Text strong>
                                Échéance {allocation.installment.period_month}/{allocation.installment.period_year} –{' '}
                                {formatDate(allocation.installment.due_date)}
                              </Text>
                              <br />
                              <Text type="secondary">
                                Montant alloué : {formatCurrency(allocation.amount, allocation.currency)}
                              </Text>
                            </>
                          ) : (
                            <>
                              <Text strong>Échéance ID: {allocation.installment_id.slice(0, 8)}</Text>
                              <br />
                              <Text type="secondary">
                                Montant alloué : {formatCurrency(allocation.amount, allocation.currency)}
                              </Text>
                            </>
                          )}
                        </Col>
                        <Col>
                          <Text type="secondary">{formatDate(allocation.created_at)}</Text>
                        </Col>
                      </Row>
                    </Card>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">Aucune allocation aux échéances.</Text>
              )}
            </div>

            {/* Allocations au dépôt de garantie */}
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                Allocation au dépôt de garantie
              </Text>
              {payment.depositMovements && payment.depositMovements.length > 0 ? (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {payment.depositMovements.map(movement => (
                    <Card key={movement.id} size="small" style={{ border: '1px solid #d9d9d9' }}>
                      <Row justify="space-between" align="middle">
                        <Col flex="auto">
                          <Text strong>{getDepositMovementTypeLabel(movement.type || 'COLLECT')}</Text>
                          <br />
                          <Text type="secondary">
                            Montant : {formatCurrency(Number(movement.amount), payment.currency)}
                          </Text>
                        </Col>
                        <Col>
                          {movement.created_at && <Text type="secondary">{formatDate(movement.created_at)}</Text>}
                        </Col>
                      </Row>
                    </Card>
                  ))}
                </Space>
              ) : (
                <Text type="secondary">Aucune allocation au dépôt de garantie.</Text>
              )}
            </div>

            {!payment.allocations?.length && !payment.depositMovements?.length && (
              <Empty
                description={
                  <>
                    <p>Aucune utilisation enregistrée pour ce paiement.</p>
                    {payment.lease_id && availableAmount > 0 && payment.status === 'SUCCESS' && (
                      <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: 8 }}>
                        Cliquez sur &quot;Allouer aux échéances&quot; pour allouer ce paiement à une ou plusieurs
                        échéances.
                      </Text>
                    )}
                  </>
                }
              />
            )}
          </Space>
        </Card>

        <Modal
          title={
            <Space>
              <FileTextOutlined />
              <span>Allouer le paiement aux échéances</span>
            </Space>
          }
          open={showAllocateForm}
          onCancel={() => setShowAllocateForm(false)}
          footer={null}
          width={800}
          destroyOnClose
        >
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">
              Montant disponible: <Text strong>{formatCurrency(availableAmount, payment.currency)}</Text>
            </Text>
          </div>
          <AllocatePaymentForm
            tenantId={tenantId!}
            payment={payment}
            onSubmit={handleAllocatePayment}
            onCancel={() => setShowAllocateForm(false)}
            loading={isAllocating}
          />
        </Modal>
      </Space>
    </>
  );
};
