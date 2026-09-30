import React, { useEffect, useState } from 'react';
import {
  App,
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { MoneyValue } from '../primitives/MoneyValue';
import { useConfirmAction } from '../primitives';
import {
  cancelProviderInvoice,
  cancelProviderPayment,
  deleteProviderInvoiceFile,
  downloadProviderInvoiceFile,
  getProviderInvoice,
  payProviderInvoice,
  uploadProviderInvoiceFile
} from '../../services/syndic-provider-invoice-service';
import {
  ProviderInvoiceDetail,
  ProviderInvoicePayment,
  ProviderPaymentMethod,
  SyndicateFund
} from '../../types/syndic-types';
import { providerInvoiceStatusColors, providerInvoiceStatusLabels, providerPaymentMethodLabels } from './labels';
import { saveBlob } from '../../utils/save-blob';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';
import { displayCurrency } from '../../utils/syndic-currency';

const { Text, Title } = Typography;
const { TextArea } = Input;

const PAYMENT_METHODS: ProviderPaymentMethod[] = ['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'CHECK', 'CARD', 'OTHER'];

interface ProviderInvoiceDrawerProps {
  tenantId: string;
  syndicId: string;
  invoiceId: string | null;
  funds: SyndicateFund[];
  onClose: () => void;
  /** Facture ou paiement modifié : le parent recharge sa liste/ses soldes. */
  onChanged: () => void;
}

/**
 * Détail d'une facture de prestataire (lot S6) : informations, pièce jointe,
 * paiements et leurs annulations, annulation de la facture. Partagé entre
 * l'onglet « Factures » et les listes « Factures liées » (contrat, incident).
 */
export const ProviderInvoiceDrawer: React.FC<ProviderInvoiceDrawerProps> = ({
  tenantId,
  syndicId,
  invoiceId,
  funds,
  onClose,
  onChanged
}) => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();

  const [invoice, setInvoice] = useState<ProviderInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [payOpen, setPayOpen] = useState(false);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payForm] = Form.useForm();

  const [cancelInvoiceOpen, setCancelInvoiceOpen] = useState(false);
  const [cancelInvoiceReason, setCancelInvoiceReason] = useState('');
  const [cancellingInvoice, setCancellingInvoice] = useState(false);

  const [cancelPaymentTarget, setCancelPaymentTarget] = useState<ProviderInvoicePayment | null>(null);
  const [cancelPaymentReason, setCancelPaymentReason] = useState('');
  const [cancellingPayment, setCancellingPayment] = useState(false);

  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingFile, setDeletingFile] = useState(false);

  useEffect(() => {
    if (!invoiceId) {
      setInvoice(null);
      return;
    }
    void load(invoiceId);
  }, [invoiceId]);

  const load = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProviderInvoice(tenantId, syndicId, id);
      setInvoice(data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger la facture'));
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    if (invoiceId) await load(invoiceId);
    onChanged();
  };

  const openPayModal = () => {
    if (!invoice) return;
    payForm.resetFields();
    payForm.setFieldsValue({
      amount: invoice.amountDue,
      paidAt: dayjs(),
      method: 'BANK_TRANSFER',
      fundId: invoice.fundId ?? undefined
    });
    setPayOpen(true);
  };

  const handlePay = async () => {
    if (!invoice) return;
    const values = await payForm.validateFields();
    setPaySubmitting(true);
    try {
      const result = await payProviderInvoice(tenantId, syndicId, invoice.id, {
        amount: values.amount,
        paidAt: values.paidAt.toISOString(),
        method: values.method,
        reference: values.reference || undefined,
        fundId: values.fundId || undefined
      });
      message.success(t('Paiement enregistré'));
      if (result.fundBalanceNegative) {
        message.warning(t('Le solde du fonds débité est désormais négatif.'));
      }
      setPayOpen(false);
      await refresh();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Enregistrement du paiement impossible'));
    } finally {
      setPaySubmitting(false);
    }
  };

  const handleCancelInvoice = async () => {
    if (!invoice) return;
    if (!cancelInvoiceReason.trim()) {
      message.error(t("Le motif de l'annulation est obligatoire"));
      return;
    }
    setCancellingInvoice(true);
    try {
      await cancelProviderInvoice(tenantId, syndicId, invoice.id, { reason: cancelInvoiceReason.trim() });
      message.success(t('Facture annulée'));
      setCancelInvoiceOpen(false);
      setCancelInvoiceReason('');
      await refresh();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Annulation de la facture impossible'));
    } finally {
      setCancellingInvoice(false);
    }
  };

  const handleCancelPayment = async () => {
    if (!invoice || !cancelPaymentTarget) return;
    if (!cancelPaymentReason.trim()) {
      message.error(t("Le motif de l'annulation est obligatoire"));
      return;
    }
    setCancellingPayment(true);
    try {
      const result = await cancelProviderPayment(tenantId, syndicId, invoice.id, cancelPaymentTarget.id, {
        reason: cancelPaymentReason.trim()
      });
      message.success(t('Paiement annulé'));
      if (result.fundBalanceNegative) {
        message.warning(t('Le solde du fonds recrédité est désormais négatif.'));
      }
      setCancelPaymentTarget(null);
      setCancelPaymentReason('');
      await refresh();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Annulation du paiement impossible'));
    } finally {
      setCancellingPayment(false);
    }
  };

  const handleDownload = async () => {
    if (!invoice) return;
    setDownloading(true);
    try {
      const { blob, filename } = await downloadProviderInvoiceFile(
        tenantId,
        syndicId,
        invoice.id,
        invoice.fileName || `${invoice.number}.pdf`
      );
      saveBlob(blob, filename);
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Téléchargement de la pièce jointe impossible'));
    } finally {
      setDownloading(false);
    }
  };

  const handleReplaceFile = async (file: File) => {
    if (!invoice) return false;
    setUploading(true);
    try {
      await uploadProviderInvoiceFile(tenantId, syndicId, invoice.id, file);
      message.success(t('Pièce jointe remplacée'));
      await refresh();
    } catch (err: any) {
      if (err.response?.status === 409) {
        message.error(
          err.response?.data?.error ||
            t('Impossible de remplacer la pièce jointe : cette facture a déjà des paiements enregistrés.')
        );
      } else {
        message.error(err.response?.data?.error || t('Remplacement de la pièce jointe impossible'));
      }
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleDeleteFile = () => {
    if (!invoice) return;
    confirmAction({
      title: t('Supprimer la pièce jointe de cette facture ?'),
      okText: t('Supprimer'),
      danger: true,
      cancelText: t('Annuler'),
      onConfirm: async () => {
        setDeletingFile(true);
        try {
          await deleteProviderInvoiceFile(tenantId, syndicId, invoice.id);
          message.success(t('Pièce jointe supprimée'));
          await refresh();
        } catch (err: any) {
          if (err.response?.status === 409) {
            message.error(
              err.response?.data?.error ||
                t('Impossible de supprimer la pièce jointe : cette facture a déjà des paiements enregistrés.')
            );
          } else {
            message.error(err.response?.data?.error || t('Suppression de la pièce jointe impossible'));
          }
        } finally {
          setDeletingFile(false);
        }
      }
    });
  };

  const paymentColumns: ColumnsType<ProviderInvoicePayment> = [
    {
      title: t('Date'),
      dataIndex: 'paidAt',
      key: 'paidAt',
      render: (value: string) => dayjs(value).format(dateFormat('short'))
    },
    {
      title: t('Montant'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'end',
      render: (_: number, row) => <MoneyValue value={row.amount} currency={displayCurrency(invoice?.currency)} />
    },
    {
      title: t('Mode'),
      dataIndex: 'method',
      key: 'method',
      render: (value: ProviderPaymentMethod) => providerPaymentMethodLabels[value]
    },
    {
      title: t('Référence'),
      dataIndex: 'reference',
      key: 'reference',
      render: (value?: string | null) => value || '—'
    },
    { title: t('Fonds'), key: 'fund', render: (_: unknown, row) => row.fund?.name || '—' },
    {
      title: t('Statut'),
      key: 'status',
      render: (_: unknown, row) => (row.cancelledAt ? <Tag>{t('Annulé')}</Tag> : <Tag color="green">{t('Actif')}</Tag>)
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_: unknown, row) =>
        row.cancelledAt ? null : (
          <Button size="small" danger onClick={() => setCancelPaymentTarget(row)}>
            {t('Annuler')}
          </Button>
        )
    }
  ];

  return (
    <Drawer
      title={invoice ? t('Facture {{number}}', { number: invoice.number }) : t('Facture')}
      open={Boolean(invoiceId)}
      onClose={onClose}
      width={720}
    >
      {loading ? (
        <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : error ? (
        <Alert type="error" message={error} showIcon />
      ) : invoice ? (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space align="center">
            <Tag color={providerInvoiceStatusColors[invoice.status]}>{providerInvoiceStatusLabels[invoice.status]}</Tag>
            {invoice.status !== 'CANCELLED' && (
              <Button danger size="small" onClick={() => setCancelInvoiceOpen(true)}>
                {t('Annuler la facture')}
              </Button>
            )}
          </Space>

          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('Prestataire')}>{invoice.provider?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('Libellé')}>{invoice.label}</Descriptions.Item>
            <Descriptions.Item label={t('Contrat')}>{invoice.contract?.nature || t('Sans contrat')}</Descriptions.Item>
            <Descriptions.Item label={t('Incident')}>
              {invoice.incident?.description || t('Sans incident')}
            </Descriptions.Item>
            <Descriptions.Item label={t('Ligne budgétaire')}>
              {invoice.budgetLine ? `${invoice.budgetLine.category} — ${invoice.budgetLine.description}` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('Fonds par défaut')}>{invoice.fund?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('Date de facture')}>
              {dayjs(invoice.invoiceDate).format(dateFormat('short'))}
            </Descriptions.Item>
            <Descriptions.Item label={t('Échéance')}>
              {invoice.dueDate ? dayjs(invoice.dueDate).format(dateFormat('short')) : t('Sans échéance')}
            </Descriptions.Item>
            <Descriptions.Item label={t('Montant HT')}>
              <MoneyValue value={invoice.amountHT} currency={displayCurrency(invoice.currency)} />
            </Descriptions.Item>
            <Descriptions.Item label={t('TVA')}>
              <MoneyValue value={invoice.vatAmount} currency={displayCurrency(invoice.currency)} />
            </Descriptions.Item>
            <Descriptions.Item label={t('Montant TTC')}>
              <MoneyValue value={invoice.amountTTC} currency={displayCurrency(invoice.currency)} />
            </Descriptions.Item>
            <Descriptions.Item label={t('Payé')}>
              <MoneyValue value={invoice.amountPaid} currency={displayCurrency(invoice.currency)} />
            </Descriptions.Item>
            <Descriptions.Item label={t('Reste dû')}>
              <MoneyValue value={invoice.amountDue} currency={displayCurrency(invoice.currency)} />
            </Descriptions.Item>
            {invoice.status === 'CANCELLED' && (
              <Descriptions.Item label={t("Motif d'annulation")}>{invoice.cancelReason}</Descriptions.Item>
            )}
          </Descriptions>

          <div>
            <Title level={5}>{t('Pièce jointe')}</Title>
            <Space wrap>
              {invoice.hasFile ? (
                <>
                  <Button icon={<DownloadOutlined />} loading={downloading} onClick={() => void handleDownload()}>
                    {t('Télécharger')} {invoice.fileName ? `(${invoice.fileName})` : ''}
                  </Button>
                  <Upload
                    maxCount={1}
                    accept=".pdf,.png,.jpg,.jpeg"
                    showUploadList={false}
                    beforeUpload={file => {
                      void handleReplaceFile(file as unknown as File);
                      return false;
                    }}
                  >
                    <Button icon={<UploadOutlined />} loading={uploading}>
                      {t('Remplacer')}
                    </Button>
                  </Upload>
                  <Button danger loading={deletingFile} onClick={handleDeleteFile}>
                    {t('Supprimer')}
                  </Button>
                </>
              ) : (
                <Upload
                  maxCount={1}
                  accept=".pdf,.png,.jpg,.jpeg"
                  showUploadList={false}
                  beforeUpload={file => {
                    void handleReplaceFile(file as unknown as File);
                    return false;
                  }}
                >
                  <Button icon={<UploadOutlined />} loading={uploading}>
                    {t('Ajouter une pièce jointe')}
                  </Button>
                </Upload>
              )}
            </Space>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title level={5} style={{ margin: 0 }}>
                {t('Paiements')}
              </Title>
              {invoice.status !== 'CANCELLED' && invoice.amountDue > 0 && (
                <Button type="primary" onClick={openPayModal}>
                  {t('Enregistrer un paiement')}
                </Button>
              )}
            </div>
            <Table
              style={{ marginTop: 12 }}
              rowKey="id"
              size="small"
              dataSource={invoice.payments}
              columns={paymentColumns}
              pagination={{ pageSize: 5, hideOnSinglePage: true }}
              locale={{ emptyText: t('Aucun paiement enregistré') }}
            />
          </div>
        </Space>
      ) : null}

      {/* Enregistrer un paiement */}
      <DrawerPaymentModal
        open={payOpen}
        submitting={paySubmitting}
        form={payForm}
        funds={funds}
        currency={invoice?.currency}
        onOk={() => void handlePay()}
        onCancel={() => setPayOpen(false)}
      />

      {/* Annulation de la facture */}
      <ReasonModal
        open={cancelInvoiceOpen}
        title={t('Annuler cette facture')}
        okText={t('Confirmer l’annulation')}
        submitting={cancellingInvoice}
        reason={cancelInvoiceReason}
        onReasonChange={setCancelInvoiceReason}
        onOk={() => void handleCancelInvoice()}
        onCancel={() => {
          setCancelInvoiceOpen(false);
          setCancelInvoiceReason('');
        }}
      />

      {/* Annulation d'un paiement */}
      <ReasonModal
        open={Boolean(cancelPaymentTarget)}
        title={t('Annuler ce paiement')}
        okText={t('Confirmer l’annulation')}
        submitting={cancellingPayment}
        reason={cancelPaymentReason}
        onReasonChange={setCancelPaymentReason}
        onOk={() => void handleCancelPayment()}
        onCancel={() => {
          setCancelPaymentTarget(null);
          setCancelPaymentReason('');
        }}
      />
    </Drawer>
  );
};

interface DrawerPaymentModalProps {
  open: boolean;
  submitting: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  funds: SyndicateFund[];
  currency?: string;
  onOk: () => void;
  onCancel: () => void;
}

/**
 * Modale « Enregistrer un paiement » — séparée du `<Modal>` d'AntD directement
 * dans le drawer pour que le mock de test (qui ne connaît qu'un seul `<Modal>`
 * ouvert à la fois par titre) reste lisible.
 */
const DrawerPaymentModal: React.FC<DrawerPaymentModalProps> = ({ open, submitting, form, funds, onOk, onCancel }) => {
  return (
    <Modal
      title={t('Enregistrer un paiement')}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      okText={t('Enregistrer')}
      cancelText={t('Annuler')}
      confirmLoading={submitting}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label={t('Montant')}
          name="amount"
          rules={[{ required: true, message: t('Le montant est obligatoire') }]}
        >
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          label={t('Date de paiement')}
          name="paidAt"
          rules={[{ required: true, message: t('La date de paiement est obligatoire') }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>
        <Form.Item label={t('Mode')} name="method" rules={[{ required: true, message: t('Le mode est obligatoire') }]}>
          <Select
            showSearch
            optionFilterProp="label"
            options={PAYMENT_METHODS.map(method => ({ value: method, label: providerPaymentMethodLabels[method] }))}
          />
        </Form.Item>
        <Form.Item label={t('Référence')} name="reference">
          <Input placeholder={t('Ex: numéro de transaction')} />
        </Form.Item>
        <Form.Item label={t('Fonds à débiter')} name="fundId">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            options={funds.map(fund => ({ value: fund.id, label: fund.name }))}
            placeholder={t('Fonds par défaut de la facture')}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

interface ReasonModalProps {
  open: boolean;
  title: string;
  okText: string;
  submitting: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onOk: () => void;
  onCancel: () => void;
}

const ReasonModal: React.FC<ReasonModalProps> = ({
  open,
  title,
  okText,
  submitting,
  reason,
  onReasonChange,
  onOk,
  onCancel
}) => {
  return (
    <Modal
      title={title}
      open={open}
      onOk={onOk}
      onCancel={onCancel}
      okText={okText}
      cancelText={t('Fermer')}
      confirmLoading={submitting}
      okButtonProps={{ danger: true }}
    >
      <Text>{t('Motif (obligatoire)')}</Text>
      <TextArea
        rows={3}
        value={reason}
        onChange={event => onReasonChange(event.target.value)}
        style={{ marginTop: 8 }}
      />
    </Modal>
  );
};
