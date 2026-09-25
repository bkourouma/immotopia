import React, { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  Upload
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import { FilePdfOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import {
  downloadAdminInvoicePdf,
  downloadPaymentProof,
  generatePlatformInvoice,
  getAdminInvoicePayment,
  getAdminPlatformInvoice,
  issueCreditNote,
  issuePlatformInvoice,
  listAdminPlatformInvoices,
  recordManualPayment,
  type ManualPaymentMethod,
  type PlatformCheckout,
  type PlatformInvoice,
  type PlatformInvoicePayment
} from '../../../services/platform-billing-service';
import { formatMoney, StatusTag, useConfirmAction } from '../../primitives';
import {
  INVOICE_NATURE_LABEL,
  INVOICE_STATUS_LABEL,
  PAYABLE_STATUSES,
  PAYMENT_METHOD_LABEL,
  formatDay,
  formatPeriod
} from '../../subscription/platform-invoice-labels';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/**
 * Onglet Factures de la fiche agence (vague 3) — factures d'abonnement
 * PLATFORM : liste, génération, émission, constat de paiement (mode, date,
 * référence, justificatif facultatif), avoir, PDF, détail avec le règlement et
 * les tentatives de paiement en ligne.
 */

const MANUAL_METHODS: Array<{ value: ManualPaymentMethod; label: string }> = [
  { value: 'BANK_TRANSFER', label: PAYMENT_METHOD_LABEL.BANK_TRANSFER },
  { value: 'MOBILE_MONEY', label: PAYMENT_METHOD_LABEL.MOBILE_MONEY },
  { value: 'CHECK', label: PAYMENT_METHOD_LABEL.CHECK },
  { value: 'CASH', label: PAYMENT_METHOD_LABEL.CASH }
];

const CHECKOUT_STATUS_LABEL: Record<string, string> = {
  PENDING: t('En attente'),
  SUCCESS: t('Réussi'),
  FAILED: t('Échoué'),
  CANCELED: t('Annulé'),
  EXPIRED: t('Expiré'),
  REVIEW: t('À vérifier')
};

interface GenerateValues {
  nature: 'PERIOD' | 'OVERAGE';
  issue: boolean;
}

interface PayValues {
  method: ManualPaymentMethod;
  paidAt: Dayjs;
  reference?: string;
  note?: string;
}

interface CreditValues {
  reason: string;
  reissuePending: boolean;
}

function errorMessage(err: any, fallback: string): string {
  return err?.response?.data?.message || fallback;
}

export const InvoicesTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  const [generateOpen, setGenerateOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateForm] = Form.useForm<GenerateValues>();

  const [paying, setPaying] = useState<PlatformInvoice | null>(null);
  const [paySaving, setPaySaving] = useState(false);
  const [proofList, setProofList] = useState<UploadFile[]>([]);
  const [payForm] = Form.useForm<PayValues>();

  const [crediting, setCrediting] = useState<PlatformInvoice | null>(null);
  const [creditSaving, setCreditSaving] = useState(false);
  const [creditForm] = Form.useForm<CreditValues>();

  const [detail, setDetail] = useState<{
    invoice: PlatformInvoice;
    payment: PlatformInvoicePayment | null;
    checkouts: PlatformCheckout[];
  } | null>(null);

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const result = await listAdminPlatformInvoices(tenantId, { page, limit: 20 });
        setInvoices(result.invoices);
        setPagination({ page: result.pagination.page, limit: result.pagination.limit, total: result.pagination.total });
      } catch (err: any) {
        message.error(errorMessage(err, t('Erreur lors du chargement des factures')));
      } finally {
        setLoading(false);
      }
    },
    [tenantId, message]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const handleGenerate = async (values: GenerateValues) => {
    setGenerating(true);
    try {
      const result = await generatePlatformInvoice(tenantId, { nature: values.nature, issue: values.issue });
      setGenerateOpen(false);
      if (!result.invoice) message.info(t('Rien à facturer pour cette période'));
      else if (!result.created) message.info(t('Cette facture existe déjà'));
      else message.success(t('Facture générée'));
      load(1);
    } catch (err: any) {
      message.error(errorMessage(err, t('Erreur lors de la génération de la facture')));
    } finally {
      setGenerating(false);
    }
  };

  const handleIssue = (invoice: PlatformInvoice) => {
    confirmAction({
      title: t('Émettre cette facture ?'),
      description: t('Elle reçoit son numéro définitif et est envoyée à l’agence.'),
      okText: t('Émettre'),
      onConfirm: async () => {
        try {
          await issuePlatformInvoice(tenantId, invoice.id);
          message.success(t('Facture émise'));
          load(pagination.page);
        } catch (err: any) {
          message.error(errorMessage(err, t("Erreur lors de l'émission")));
        }
      }
    });
  };

  const openPay = (invoice: PlatformInvoice) => {
    setPaying(invoice);
    setProofList([]);
    payForm.setFieldsValue({ method: 'BANK_TRANSFER', paidAt: dayjs(), reference: undefined, note: undefined });
  };

  const handlePay = async (values: PayValues) => {
    if (!paying) return;
    setPaySaving(true);
    try {
      const proof = (proofList[0]?.originFileObj as File | undefined) ?? null;
      const result = await recordManualPayment(tenantId, paying.id, {
        method: values.method,
        paidAt: values.paidAt.toISOString(),
        reference: values.reference?.trim() || undefined,
        note: values.note?.trim() || undefined,
        proof
      });
      message.success(
        result.subscription === 'RENEWED'
          ? t('Paiement enregistré : abonnement réactivé')
          : t('Paiement enregistré')
      );
      setPaying(null);
      load(pagination.page);
    } catch (err: any) {
      message.error(errorMessage(err, t("Erreur lors de l'enregistrement du paiement")));
    } finally {
      setPaySaving(false);
    }
  };

  const handleCredit = async (values: CreditValues) => {
    if (!crediting) return;
    setCreditSaving(true);
    try {
      await issueCreditNote(tenantId, crediting.id, { reason: values.reason, reissuePending: values.reissuePending });
      message.success(t('Avoir émis'));
      setCrediting(null);
      load(pagination.page);
    } catch (err: any) {
      message.error(errorMessage(err, t("Erreur lors de l'émission de l'avoir")));
    } finally {
      setCreditSaving(false);
    }
  };

  const openDetail = async (invoice: PlatformInvoice) => {
    try {
      const [full, payment] = await Promise.all([
        getAdminPlatformInvoice(tenantId, invoice.id),
        getAdminInvoicePayment(tenantId, invoice.id)
      ]);
      setDetail({ invoice: full, payment: payment.payment, checkouts: payment.checkouts });
    } catch (err: any) {
      message.error(errorMessage(err, t('Erreur lors du chargement de la facture')));
    }
  };

  const handlePdf = async (invoice: PlatformInvoice) => {
    try {
      await downloadAdminInvoicePdf(tenantId, invoice);
    } catch (err: any) {
      message.error(errorMessage(err, t('Téléchargement impossible')));
    }
  };

  const columns: ColumnsType<PlatformInvoice> = [
    {
      title: t('Numéro'),
      dataIndex: 'invoiceNumber',
      key: 'number',
      render: (v: string | null, r) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => openDetail(r)}>
          {v ?? t('Brouillon')}
        </Button>
      )
    },
    { title: t('Nature'), dataIndex: 'nature', key: 'nature', render: (v: string | null) => (v ? INVOICE_NATURE_LABEL[v] ?? v : '—') },
    { title: t('Période'), key: 'period', render: (_, r) => formatPeriod(r.periodStart, r.periodEnd) },
    { title: t('Échéance'), dataIndex: 'dueDate', key: 'due', render: formatDay },
    {
      title: t('Montant TTC'),
      dataIndex: 'amountTotal',
      key: 'amount',
      align: 'end',
      render: (_, r) => formatMoney(r.amountTotal, { currency: r.currency })
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const info = INVOICE_STATUS_LABEL[status];
        return <StatusTag status={status} tone={info?.tone} label={info?.label} />;
      }
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, r) => (
        <Space wrap>
          <Button size="small" icon={<FilePdfOutlined />} onClick={() => handlePdf(r)}>
            {t('PDF')}
          </Button>
          {r.status === 'DRAFT' && (
            <Button size="small" onClick={() => handleIssue(r)}>
              {t('Émettre')}
            </Button>
          )}
          {PAYABLE_STATUSES.includes(r.status) && r.nature !== 'CREDIT_NOTE' && (
            <Button size="small" type="primary" onClick={() => openPay(r)}>
              {t('Marquer payée')}
            </Button>
          )}
          {r.status !== 'DRAFT' && r.status !== 'CANCELED' && r.nature !== 'CREDIT_NOTE' && (
            <Button
              size="small"
              danger
              onClick={() => {
                setCrediting(r);
                creditForm.setFieldsValue({ reason: '', reissuePending: false });
              }}
            >
              {t('Avoir')}
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBlockEnd: 'var(--space-4)' }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            generateForm.setFieldsValue({ nature: 'PERIOD', issue: false });
            setGenerateOpen(true);
          }}
        >
          {t('Générer une facture')}
        </Button>
      </div>

      <Table<PlatformInvoice>
        rowKey="id"
        columns={columns}
        dataSource={invoices}
        loading={loading}
        scroll={{ x: 'max-content' }}
        aria-label={t('Factures')}
        pagination={{ current: pagination.page, pageSize: pagination.limit, total: pagination.total, onChange: page => load(page) }}
        locale={{ emptyText: t('Aucune facture pour cette agence') }}
      />

      <Modal
        title={t('Générer une facture')}
        open={generateOpen}
        onCancel={() => setGenerateOpen(false)}
        onOk={() => generateForm.submit()}
        confirmLoading={generating}
        okText={t('Générer')}
        cancelText={t('Annuler')}
      >
        <Form form={generateForm} layout="vertical" onFinish={handleGenerate}>
          <Form.Item label={t('Nature')} name="nature" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'PERIOD', label: t('Période suivante') },
                { value: 'OVERAGE', label: t('Dépassement mensuel (abonnement annuel)') }
              ]}
            />
          </Form.Item>
          <Form.Item name="issue" valuePropName="checked">
            <Checkbox>{t('Émettre immédiatement')}</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={paying ? t('Paiement de la facture {{value}}', { value: paying.invoiceNumber ?? '' }) : ''}
        open={Boolean(paying)}
        onCancel={() => setPaying(null)}
        onOk={() => payForm.submit()}
        confirmLoading={paySaving}
        okText={t('Enregistrer le paiement')}
        cancelText={t('Annuler')}
      >
        {paying && (
          <Text type="secondary">
            {t('Montant : {{value}}', { value: formatMoney(paying.amountTotal, { currency: paying.currency }) })}
          </Text>
        )}
        <Form form={payForm} layout="vertical" onFinish={handlePay} style={{ marginBlockStart: 'var(--space-3)' }}>
          <Form.Item label={t('Mode de règlement')} name="method" rules={[{ required: true }]}>
            <Select options={MANUAL_METHODS} />
          </Form.Item>
          <Form.Item label={t('Date de paiement')} name="paidAt" rules={[{ required: true, message: t('La date est requise') }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" disabledDate={d => d.isAfter(dayjs().endOf('day'))} />
          </Form.Item>
          <Form.Item label={t('Référence')} name="reference">
            <Input maxLength={120} placeholder={t('N° de virement, de transaction, de chèque…')} />
          </Form.Item>
          <Form.Item label={t('Note')} name="note">
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
          <Form.Item label={t('Justificatif (facultatif)')}>
            <Upload
              accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
              maxCount={1}
              fileList={proofList}
              beforeUpload={() => false}
              onChange={({ fileList }) => setProofList(fileList.slice(-1))}
            >
              <Button icon={<UploadOutlined />}>{t('Joindre un fichier')}</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={crediting ? t('Avoir sur la facture {{value}}', { value: crediting.invoiceNumber ?? '' }) : ''}
        open={Boolean(crediting)}
        onCancel={() => setCrediting(null)}
        onOk={() => creditForm.submit()}
        confirmLoading={creditSaving}
        okText={t("Émettre l'avoir")}
        okButtonProps={{ danger: true }}
        cancelText={t('Annuler')}
      >
        <Form form={creditForm} layout="vertical" onFinish={handleCredit}>
          <Form.Item label={t('Motif')} name="reason" rules={[{ required: true, message: t('Le motif est requis') }]}>
            <Input.TextArea rows={3} maxLength={2000} />
          </Form.Item>
          <Form.Item name="reissuePending" valuePropName="checked">
            <Checkbox>{t('Remettre les lignes en attente pour une facture corrigée')}</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detail ? t('Facture {{value}}', { value: detail.invoice.invoiceNumber ?? t('Brouillon') }) : ''}
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        width={560}
      >
        {detail && (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label={t('Période')}>
                {formatPeriod(detail.invoice.periodStart, detail.invoice.periodEnd)}
              </Descriptions.Item>
              <Descriptions.Item label={t('Total HT')}>
                {formatMoney(detail.invoice.amountExclTax, { currency: detail.invoice.currency })}
              </Descriptions.Item>
              <Descriptions.Item label={t('TVA {{value}} %', { value: detail.invoice.taxRate })}>
                {formatMoney(detail.invoice.taxAmount, { currency: detail.invoice.currency })}
              </Descriptions.Item>
              <Descriptions.Item label={t('Total TTC')}>
                {formatMoney(detail.invoice.amountTotal, { currency: detail.invoice.currency })}
              </Descriptions.Item>
              {detail.invoice.cancelReason && (
                <Descriptions.Item label={t("Motif d'annulation")}>{detail.invoice.cancelReason}</Descriptions.Item>
              )}
            </Descriptions>

            {detail.invoice.lines && detail.invoice.lines.length > 0 && (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detail.invoice.lines}
                aria-label={t('Lignes')}
                columns={[
                  { title: t('Libellé'), dataIndex: 'label', key: 'label' },
                  {
                    title: t('Montant HT'),
                    dataIndex: 'amount',
                    key: 'amount',
                    align: 'end',
                    render: (v: number) => formatMoney(v, { currency: detail.invoice.currency })
                  }
                ]}
              />
            )}

            <div>
              <Text strong>{t('Règlement')}</Text>
              {detail.payment ? (
                <Descriptions column={1} size="small" style={{ marginBlockStart: 'var(--space-2)' }}>
                  <Descriptions.Item label={t('Mode de règlement')}>
                    {PAYMENT_METHOD_LABEL[detail.payment.method] ?? detail.payment.method}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('Date de paiement')}>{formatDay(detail.payment.paidAt)}</Descriptions.Item>
                  <Descriptions.Item label={t('Référence')}>{detail.payment.reference ?? '—'}</Descriptions.Item>
                  {detail.payment.note && <Descriptions.Item label={t('Note')}>{detail.payment.note}</Descriptions.Item>}
                  {detail.payment.hasProof && (
                    <Descriptions.Item label={t('Justificatif')}>
                      <Button
                        size="small"
                        type="link"
                        onClick={() =>
                          downloadPaymentProof(tenantId, detail.invoice.id, detail.payment?.proofName ?? 'justificatif').catch(
                            (err: any) => message.error(errorMessage(err, t('Téléchargement impossible')))
                          )
                        }
                      >
                        {detail.payment.proofName ?? t('Télécharger')}
                      </Button>
                    </Descriptions.Item>
                  )}
                </Descriptions>
              ) : (
                <div>
                  <Text type="secondary">{t('Aucun règlement enregistré.')}</Text>
                </div>
              )}
            </div>

            {detail.checkouts.length > 0 && (
              <Table<PlatformCheckout>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detail.checkouts}
                aria-label={t('Paiements en ligne')}
                columns={[
                  { title: t('Date'), dataIndex: 'createdAt', key: 'createdAt', render: formatDay },
                  { title: t('Référence'), dataIndex: 'codePaiement', key: 'code' },
                  {
                    title: t('Statut'),
                    dataIndex: 'status',
                    key: 'status',
                    render: (v: string, r) => (
                      <Space direction="vertical" size={0}>
                        <Text>{CHECKOUT_STATUS_LABEL[v] ?? v}</Text>
                        {(r.reviewReason || r.failureMessage) && (
                          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                            {r.reviewReason ?? r.failureMessage}
                          </Text>
                        )}
                      </Space>
                    )
                  }
                ]}
              />
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
};
