import React, { useState, useEffect } from 'react';
import { App, Table, Button, Tag, Space, Typography, Empty, Alert, Select, Modal, Input, Image } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EyeOutlined, CheckCircleOutlined, CloseCircleOutlined, FileImageOutlined } from '@ant-design/icons';
import {
  listPaymentDeclarations,
  approvePaymentDeclaration,
  rejectPaymentDeclaration,
  RentalPaymentDeclaration,
  PaymentDeclarationStatus,
  PaymentDeclarationFilters,
  RentalPaymentMethod
} from '../../services/rental-service';

const { Text } = Typography;
const { TextArea } = Input;

interface PaymentDeclarationsListProps {
  tenantId: string;
  leaseId?: string;
  onApproveSuccess?: () => void;
  onRejectSuccess?: () => void;
}

export const PaymentDeclarationsList: React.FC<PaymentDeclarationsListProps> = ({
  tenantId,
  leaseId,
  onApproveSuccess,
  onRejectSuccess
}) => {
  const { message } = App.useApp();

  const [declarations, setDeclarations] = useState<RentalPaymentDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PaymentDeclarationFilters>({
    status: undefined,
    leaseId: leaseId,
    page: 1,
    limit: 100
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 0
  });
  const [approveModalVisible, setApproveModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [selectedDeclaration, setSelectedDeclaration] = useState<RentalPaymentDeclaration | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [proofImageVisible, setProofImageVisible] = useState(false);
  const [proofImageUrl, setProofImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (tenantId) {
      loadDeclarations();
    }
  }, [tenantId, filters, leaseId]);

  const loadDeclarations = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listPaymentDeclarations(tenantId, {
        ...filters,
        leaseId: leaseId || filters.leaseId
      });
      if (response.success) {
        setDeclarations(response.data);
        setPagination(response.pagination);
      } else {
        setError('Erreur lors du chargement des déclarations');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des déclarations');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = (declaration: RentalPaymentDeclaration) => {
    setSelectedDeclaration(declaration);
    setReviewNotes('');
    setApproveModalVisible(true);
  };

  const handleReject = (declaration: RentalPaymentDeclaration) => {
    setSelectedDeclaration(declaration);
    setReviewNotes('');
    setRejectModalVisible(true);
  };

  const confirmApprove = async () => {
    if (!selectedDeclaration || !tenantId) return;
    setProcessing(true);
    try {
      await approvePaymentDeclaration(tenantId, selectedDeclaration.id, {
        reviewNotes: reviewNotes || undefined
      });
      message.success('Déclaration approuvée avec succès');
      setApproveModalVisible(false);
      setSelectedDeclaration(null);
      setReviewNotes('');
      await loadDeclarations();
      onApproveSuccess?.();
    } catch (err: any) {
      message.error(err.response?.data?.message || "Erreur lors de l'approbation");
    } finally {
      setProcessing(false);
    }
  };

  const confirmReject = async () => {
    if (!selectedDeclaration || !tenantId || !reviewNotes.trim()) {
      message.warning('Veuillez fournir une raison pour le rejet');
      return;
    }
    setProcessing(true);
    try {
      await rejectPaymentDeclaration(tenantId, selectedDeclaration.id, {
        reviewNotes: reviewNotes
      });
      message.success('Déclaration rejetée');
      setRejectModalVisible(false);
      setSelectedDeclaration(null);
      setReviewNotes('');
      await loadDeclarations();
      onRejectSuccess?.();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Erreur lors du rejet');
    } finally {
      setProcessing(false);
    }
  };

  const handleViewProof = (url: string) => {
    setProofImageUrl(url);
    setProofImageVisible(true);
  };

  const getStatusTag = (status: PaymentDeclarationStatus) => {
    const statusMap: Record<PaymentDeclarationStatus, { label: string; color: string }> = {
      PENDING: { label: 'En attente', color: 'orange' },
      APPROVED: { label: 'Approuvée', color: 'green' },
      REJECTED: { label: 'Rejetée', color: 'red' },
      CANCELED: { label: 'Annulée', color: 'default' }
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
    return new Date(dateString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency
    }).format(amount);
  };

  const columns: ColumnsType<RentalPaymentDeclaration> = [
    {
      title: 'Date de déclaration',
      key: 'created_at',
      render: (_, record) => formatDate(record.created_at),
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    },
    {
      title: 'Date de paiement',
      key: 'payment_date',
      render: (_, record) => formatDate(record.payment_date)
    },
    {
      title: 'Locataire',
      key: 'declarer',
      render: (_, record) => record.declarer?.user?.fullName || '-'
    },
    {
      title: 'Bail',
      key: 'lease',
      render: (_, record) => record.lease?.lease_number || '-'
    },
    {
      title: 'Échéance',
      key: 'installment',
      render: (_, record) => {
        if (record.installment) {
          return `${record.installment.period_month}/${record.installment.period_year}`;
        }
        return '-';
      }
    },
    {
      title: 'Montant',
      key: 'amount',
      render: (_, record) => formatCurrency(Number(record.amount)),
      sorter: (a, b) => Number(a.amount) - Number(b.amount)
    },
    {
      title: 'Méthode',
      key: 'payment_method',
      render: (_, record) => getMethodLabel(record.payment_method)
    },
    {
      title: 'Référence',
      key: 'reference',
      render: (_, record) => record.reference || '-'
    },
    {
      title: 'Statut',
      key: 'status',
      render: (_, record) => getStatusTag(record.status)
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          {record.proof_file_url && (
            <Button
              type="text"
              icon={<FileImageOutlined />}
              onClick={() => handleViewProof(record.proof_file_url!)}
              title="Voir la preuve de paiement"
            />
          )}
          {record.status === PaymentDeclarationStatus.PENDING && (
            <>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => handleApprove(record)} size="small">
                Approuver
              </Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={() => handleReject(record)} size="small">
                Rejeter
              </Button>
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {error && (
          <Alert message="Erreur" description={error} type="error" showIcon closable onClose={() => setError(null)} />
        )}

        <Space>
          <Select
            value={filters.status || 'all'}
            onChange={value =>
              setFilters({
                ...filters,
                status: value === 'all' ? undefined : (value as PaymentDeclarationStatus),
                page: 1
              })
            }
            style={{ width: 200 }}
          >
            <Select.Option value="all">Tous les statuts</Select.Option>
            <Select.Option value={PaymentDeclarationStatus.PENDING}>En attente</Select.Option>
            <Select.Option value={PaymentDeclarationStatus.APPROVED}>Approuvées</Select.Option>
            <Select.Option value={PaymentDeclarationStatus.REJECTED}>Rejetées</Select.Option>
            <Select.Option value={PaymentDeclarationStatus.CANCELED}>Annulées</Select.Option>
          </Select>
        </Space>

        {declarations.length === 0 && !loading ? (
          <Empty description="Aucune déclaration trouvée" />
        ) : (
          <Table
            dataSource={declarations}
            loading={loading}
            rowKey="id"
            scroll={{ x: 'max-content' }}
            columns={columns}
            pagination={{
              current: pagination.page,
              pageSize: pagination.limit,
              total: pagination.total,
              showSizeChanger: true,
              pageSizeOptions: ['20', '50', '100', '200'],
              showTotal: total => `Total ${total} déclaration${total !== 1 ? 's' : ''}`,
              onChange: (page, pageSize) => {
                setFilters(prev => ({ ...prev, page, limit: pageSize ?? prev.limit }));
              }
            }}
          />
        )}
      </Space>

      {/* Approve Modal */}
      <Modal
        title="Approuver la déclaration de paiement"
        open={approveModalVisible}
        onOk={confirmApprove}
        onCancel={() => {
          setApproveModalVisible(false);
          setSelectedDeclaration(null);
          setReviewNotes('');
        }}
        confirmLoading={processing}
        okText="Approuver"
        cancelText="Annuler"
      >
        {selectedDeclaration && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>Montant : </Text>
              <Text>{formatCurrency(Number(selectedDeclaration.amount))}</Text>
            </div>
            <div>
              <Text strong>Date de paiement : </Text>
              <Text>{formatDate(selectedDeclaration.payment_date)}</Text>
            </div>
            <div>
              <Text strong>Méthode : </Text>
              <Text>{getMethodLabel(selectedDeclaration.payment_method)}</Text>
            </div>
            {selectedDeclaration.declarer?.user?.fullName && (
              <div>
                <Text strong>Déclarant : </Text>
                <Text>{selectedDeclaration.declarer.user.fullName}</Text>
              </div>
            )}
            <div>
              <Text strong>Notes de révision (optionnel) :</Text>
              <TextArea
                rows={4}
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Ajoutez des notes de révision si nécessaire..."
              />
            </div>
          </Space>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        title="Rejeter la déclaration de paiement"
        open={rejectModalVisible}
        onOk={confirmReject}
        onCancel={() => {
          setRejectModalVisible(false);
          setSelectedDeclaration(null);
          setReviewNotes('');
        }}
        confirmLoading={processing}
        okText="Rejeter"
        cancelText="Annuler"
        okButtonProps={{ danger: true }}
      >
        {selectedDeclaration && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>Montant : </Text>
              <Text>{formatCurrency(Number(selectedDeclaration.amount))}</Text>
            </div>
            <div>
              <Text strong>Date de paiement : </Text>
              <Text>{formatDate(selectedDeclaration.payment_date)}</Text>
            </div>
            {selectedDeclaration.declarer?.user?.fullName && (
              <div>
                <Text strong>Déclarant : </Text>
                <Text>{selectedDeclaration.declarer.user.fullName}</Text>
              </div>
            )}
            <div>
              <Text strong>Raison du rejet (obligatoire) :</Text>
              <TextArea
                rows={4}
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Expliquez pourquoi cette déclaration est rejetée..."
                required
              />
            </div>
          </Space>
        )}
      </Modal>

      {/* Proof Image Modal */}
      <Modal
        title="Preuve de paiement"
        open={proofImageVisible}
        onCancel={() => {
          setProofImageVisible(false);
          setProofImageUrl(null);
        }}
        footer={null}
        width={800}
      >
        {proofImageUrl && (
          <Image src={proofImageUrl} alt="Preuve de paiement" style={{ width: '100%' }} preview={false} />
        )}
      </Modal>
    </>
  );
};
