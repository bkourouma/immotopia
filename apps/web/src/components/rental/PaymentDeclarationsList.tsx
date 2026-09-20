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
import { nomDuBien, nomDeLaPersonne, ABSENT } from '../../lib/rental-labels';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
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
        setError(t('Erreur lors du chargement des déclarations'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des déclarations'));
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
      message.success(t('Déclaration approuvée avec succès'));
      setApproveModalVisible(false);
      setSelectedDeclaration(null);
      setReviewNotes('');
      await loadDeclarations();
      onApproveSuccess?.();
    } catch (err: any) {
      message.error(err.response?.data?.message || t("Erreur lors de l'approbation"));
    } finally {
      setProcessing(false);
    }
  };

  const confirmReject = async () => {
    if (!selectedDeclaration || !tenantId || !reviewNotes.trim()) {
      message.warning(t('Veuillez fournir une raison pour le rejet'));
      return;
    }
    setProcessing(true);
    try {
      await rejectPaymentDeclaration(tenantId, selectedDeclaration.id, {
        reviewNotes: reviewNotes
      });
      message.success(t('Déclaration rejetée'));
      setRejectModalVisible(false);
      setSelectedDeclaration(null);
      setReviewNotes('');
      await loadDeclarations();
      onRejectSuccess?.();
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors du rejet'));
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
      PENDING: { label: t('En attente'), color: 'orange' },
      APPROVED: { label: t('Approuvée'), color: 'green' },
      REJECTED: { label: t('Rejetée'), color: 'red' },
      CANCELED: { label: t('Annulée'), color: 'default' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  const getMethodLabel = (method: RentalPaymentMethod) => {
    const methodMap: Record<RentalPaymentMethod, string> = {
      CASH: t('Espèces'),
      BANK_TRANSFER: t('Virement bancaire'),
      CHECK: t('Chèque'),
      MOBILE_MONEY: t('Mobile Money'),
      CARD: t('Carte bancaire'),
      OTHER: 'Autre'
    };
    return methodMap[method] || method;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(activeLocale(), {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount: number, currency: string = 'FCFA') => {
    return new Intl.NumberFormat(activeLocale(), {
      style: 'currency',
      currency: currency === 'FCFA' ? 'XOF' : currency
    }).format(amount);
  };

  const columns: ColumnsType<RentalPaymentDeclaration> = [
    {
      title: t('Date de déclaration'),
      key: 'created_at',
      render: (_, record) => formatDate(record.created_at),
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    },
    {
      title: t('Date de paiement'),
      key: 'payment_date',
      render: (_, record) => formatDate(record.payment_date)
    },
    {
      title: t('Bail'),
      key: 'lease',
      width: 250,
      render: (_, record) => (
        <>
          <div style={{ fontWeight: 600 }}>{record.lease?.lease_number || ABSENT}</div>
          {/* Le bien sous son numéro, comme sur les trois autres écrans du
              module : une déclaration doit se rattacher à un bail nommé, pas à
              une référence seule. */}
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {nomDuBien(record.lease?.property)}
          </div>
        </>
      )
    },
    {
      title: t('Locataire'),
      key: 'declarer',
      width: 170,
      render: (_, record) => nomDeLaPersonne(record.declarer?.user)
    },
    {
      title: t('Échéance'),
      key: 'installment',
      render: (_, record) => {
        if (record.installment) {
          return `${record.installment.period_month}/${record.installment.period_year}`;
        }
        return '-';
      }
    },
    {
      title: t('Montant'),
      key: 'amount',
      render: (_, record) => formatCurrency(Number(record.amount)),
      sorter: (a, b) => Number(a.amount) - Number(b.amount)
    },
    {
      title: t('Méthode'),
      key: 'payment_method',
      render: (_, record) => getMethodLabel(record.payment_method)
    },
    {
      title: t('Référence'),
      key: 'reference',
      render: (_, record) => record.reference || '-'
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_, record) => getStatusTag(record.status)
    },
    {
      title: t('Actions'),
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space>
          {record.proof_file_url && (
            <Button
              type="text"
              icon={<FileImageOutlined />}
              onClick={() => handleViewProof(record.proof_file_url!)}
              title={t('Voir la preuve de paiement')}
            />
          )}
          {record.status === PaymentDeclarationStatus.PENDING && (
            <>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => handleApprove(record)} size="small">
                {t('Approuver')}
              </Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={() => handleReject(record)} size="small">
                {t('Rejeter')}
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
          <Alert
            message={t('Erreur')}
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        <Space>
          <Select
            showSearch
            optionFilterProp="children"
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
            <Select.Option value="all">{t('Tous les statuts')}</Select.Option>
            <Select.Option value={PaymentDeclarationStatus.PENDING}>{t('En attente')}</Select.Option>
            <Select.Option value={PaymentDeclarationStatus.APPROVED}>{t('Approuvées')}</Select.Option>
            <Select.Option value={PaymentDeclarationStatus.REJECTED}>{t('Rejetées')}</Select.Option>
            <Select.Option value={PaymentDeclarationStatus.CANCELED}>{t('Annulées')}</Select.Option>
          </Select>
        </Space>

        {declarations.length === 0 && !loading ? (
          <Empty description={t('Aucune déclaration trouvée')} />
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
              showTotal: total =>
                t('Total {{total}} déclaration{{value}}', { total: total, value: total !== 1 ? 's' : '' }),
              onChange: (page, pageSize) => {
                setFilters(prev => ({ ...prev, page, limit: pageSize ?? prev.limit }));
              }
            }}
          />
        )}
      </Space>

      {/* Approve Modal */}
      <Modal
        title={t('Approuver la déclaration de paiement')}
        open={approveModalVisible}
        onOk={confirmApprove}
        onCancel={() => {
          setApproveModalVisible(false);
          setSelectedDeclaration(null);
          setReviewNotes('');
        }}
        confirmLoading={processing}
        okText={t('Approuver')}
        cancelText={t('Annuler')}
      >
        {selectedDeclaration && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>{t('Montant :')} </Text>
              <Text>{formatCurrency(Number(selectedDeclaration.amount))}</Text>
            </div>
            <div>
              <Text strong>{t('Date de paiement :')} </Text>
              <Text>{formatDate(selectedDeclaration.payment_date)}</Text>
            </div>
            <div>
              <Text strong>{t('Méthode :')} </Text>
              <Text>{getMethodLabel(selectedDeclaration.payment_method)}</Text>
            </div>
            {selectedDeclaration.declarer?.user?.fullName && (
              <div>
                <Text strong>{t('Déclarant :')} </Text>
                <Text>{selectedDeclaration.declarer.user.fullName}</Text>
              </div>
            )}
            <div>
              <Text strong>{t('Notes de révision (optionnel) :')}</Text>
              <TextArea
                rows={4}
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder={t('Ajoutez des notes de révision si nécessaire...')}
              />
            </div>
          </Space>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        title={t('Rejeter la déclaration de paiement')}
        open={rejectModalVisible}
        onOk={confirmReject}
        onCancel={() => {
          setRejectModalVisible(false);
          setSelectedDeclaration(null);
          setReviewNotes('');
        }}
        confirmLoading={processing}
        okText={t('Rejeter')}
        cancelText={t('Annuler')}
        okButtonProps={{ danger: true }}
      >
        {selectedDeclaration && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>{t('Montant :')} </Text>
              <Text>{formatCurrency(Number(selectedDeclaration.amount))}</Text>
            </div>
            <div>
              <Text strong>{t('Date de paiement :')} </Text>
              <Text>{formatDate(selectedDeclaration.payment_date)}</Text>
            </div>
            {selectedDeclaration.declarer?.user?.fullName && (
              <div>
                <Text strong>{t('Déclarant :')} </Text>
                <Text>{selectedDeclaration.declarer.user.fullName}</Text>
              </div>
            )}
            <div>
              <Text strong>{t('Raison du rejet (obligatoire) :')}</Text>
              <TextArea
                rows={4}
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder={t('Expliquez pourquoi cette déclaration est rejetée...')}
                required
              />
            </div>
          </Space>
        )}
      </Modal>

      {/* Proof Image Modal */}
      <Modal
        title={t('Preuve de paiement')}
        open={proofImageVisible}
        onCancel={() => {
          setProofImageVisible(false);
          setProofImageUrl(null);
        }}
        footer={null}
        width={800}
      >
        {proofImageUrl && (
          <Image src={proofImageUrl} alt={t('Preuve de paiement')} style={{ width: '100%' }} preview={false} />
        )}
      </Modal>
    </>
  );
};
