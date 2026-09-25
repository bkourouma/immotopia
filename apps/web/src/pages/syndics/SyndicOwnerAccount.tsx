import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Typography
} from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  createLotOwnerAccountAdjustment,
  downloadLotOwnerAccountStatement,
  getLotOwnerAccount,
  listLotOwnerAccountTransactions
} from '../../services/syndic-service';
import { OwnerAccount, OwnerAccountTransaction } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Paragraph, Title } = Typography;

function transactionTypeLabels(): Record<OwnerAccountTransaction['type'], string> {
  return {
    CHARGE_CALL: t('Appel de charges'),
    PAYMENT: t('Paiement'),
    PENALTY: t('Pénalité'),
    WAIVER: t('Remise'),
    ADJUSTMENT: t('Ajustement'),
    FUND_TRANSFER: t('Transfert de fonds')
  };
}

export const SyndicOwnerAccount: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId, lotId } = useSyndicRouteContext();
  const navigate = useNavigate();
  const [account, setAccount] = useState<OwnerAccount | null>(null);
  const [transactions, setTransactions] = useState<OwnerAccountTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!effectiveTenantId || !syndicId || !lotId) {
      setLoading(false);
      setError(t('Paramètres compte lot manquants'));
      return;
    }
    void loadData();
  }, [effectiveTenantId, syndicId, lotId]);

  const loadData = async () => {
    if (!effectiveTenantId || !syndicId || !lotId) return;
    setLoading(true);
    setError(null);
    try {
      const [accountData, txData] = await Promise.all([
        getLotOwnerAccount(effectiveTenantId, syndicId, lotId),
        listLotOwnerAccountTransactions(effectiveTenantId, syndicId, lotId, { page: 1, limit: 100 })
      ]);
      setAccount(accountData);
      setTransactions(txData);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger le compte lot'));
    } finally {
      setLoading(false);
    }
  };

  const ownerName = useMemo(() => {
    if (!account?.contact) return t('Propriétaire');
    return (
      [account.contact.firstName, account.contact.lastName].filter(Boolean).join(' ').trim() ||
      account.contact.legalName ||
      t('Propriétaire')
    );
  }, [account]);

  const handleAdjustment = async () => {
    if (!effectiveTenantId || !syndicId || !lotId) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await createLotOwnerAccountAdjustment(effectiveTenantId, syndicId, lotId, {
        direction: values.direction,
        amount: values.amount,
        label: values.label,
        reference: values.reference || undefined
      });
      message.success(t('Ajustement enregistré'));
      setOpen(false);
      form.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Ajustement impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadStatement = async () => {
    if (!effectiveTenantId || !syndicId || !lotId) return;
    try {
      const blob = await downloadLotOwnerAccountStatement(effectiveTenantId, syndicId, lotId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `releve-compte-lot-${lotId}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Téléchargement du relevé impossible'));
    }
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}/lots`)}
            >
              {t('Retour aux lots')}
            </Button>
            <Title level={2} style={{ margin: 0 }}>
              {t('Compte du lot')} {account?.lot?.lotNumber || lotId}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Suivi du compte individuel et des mouvements.')}
            </Paragraph>
          </Space>
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => void handleDownloadStatement()}>
              {t('Télécharger le relevé')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              {t('Ajouter ajustement')}
            </Button>
          </Space>
        </div>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic
                    title={t('Solde courant')}
                    value={Number(account?.balance ?? 0)}
                    suffix={account?.currency || 'XOF'}
                  />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title={t('Transactions')} value={transactions.length} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title={t('Propriétaire')} value={ownerName} />
                </Card>
              </Col>
            </Row>

            <Card title={t('Historique des transactions')}>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={transactions}
                pagination={{ pageSize: 12 }}
                columns={[
                  {
                    title: 'Date',
                    dataIndex: 'transactionDate',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  },
                  {
                    title: 'Type',
                    dataIndex: 'type',
                    render: (value: OwnerAccountTransaction['type']) => transactionTypeLabels()[value] || value
                  },
                  { title: t('Libellé'), dataIndex: 'label' },
                  {
                    title: t('Débit'),
                    dataIndex: 'debit',
                    render: (value: number | string | null) =>
                      value ? Number(value).toLocaleString(activeLocale()) : '-'
                  },
                  {
                    title: t('Crédit'),
                    dataIndex: 'credit',
                    render: (value: number | string | null) =>
                      value ? Number(value).toLocaleString(activeLocale()) : '-'
                  },
                  {
                    title: 'Solde',
                    dataIndex: 'balanceAfter',
                    render: (value: number | string) => Number(value).toLocaleString(activeLocale())
                  }
                ]}
              />
            </Card>
          </>
        )}
      </Space>

      <Modal
        title={t('Ajouter un ajustement')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void handleAdjustment()}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form form={form} layout="vertical" initialValues={{ direction: 'DEBIT' }}>
          <Form.Item label={t('Direction')} name="direction" rules={[{ required: true }]}>
            <Select
              options={[
                { label: t('Débit'), value: 'DEBIT' },
                { label: t('Crédit'), value: 'CREDIT' }
              ]}
            />
          </Form.Item>
          <Form.Item
            label={t('Montant')}
            name="amount"
            rules={[{ required: true, message: t('Le montant est obligatoire') }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={t('Libellé')}
            name="label"
            rules={[{ required: true, message: t('Le libellé est obligatoire') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label={t('Référence (optionnel)')} name="reference">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
