import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import {
  createSaleCommissionPayment,
  getSaleCommission,
  listSaleCommissions,
  voidSaleCommissionPayment
} from '../../services/sales-service';
import type {
  CreateSaleCommissionPaymentInput,
  SaleCommissionDto,
  SaleCommissionPaymentDto,
  SaleCommissionStatus
} from '../../services/sales-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { MoneyValue, PageHeader, StateBlock, StatCard, StatusTag } from '../../components/primitives';
import { montantSaisiProps } from '../../utils/montant-saisi';
import { TreasuryAccountSelector, type TreasuryPaymentMethod } from '../../components/finance/TreasuryAccountSelector';
import { SALE_PAYMENT_METHOD_LABELS, dateCourte } from './helpers';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { t } from '../../i18n/t';
import { SaleStatusTag } from './SaleStatusTag';

const { Text } = Typography;
const { TextArea } = Input;

const STATUS_OPTIONS: { value: SaleCommissionStatus; label: string }[] = [
  { value: 'DUE', label: t('À encaisser') },
  { value: 'PARTIALLY_PAID', label: t('Partiellement réglée') },
  { value: 'PAID', label: t('Réglée') },
  { value: 'CANCELLED', label: t('Annulée') }
];

interface PaymentFormValues {
  amount: number;
  paidAt: dayjs.Dayjs;
  paymentMethod: TreasuryPaymentMethod;
  treasuryAccountId: string;
  reference?: string;
}

/**
 * Commissions de vente — lot 9 (PRD §5.5).
 *
 * Liste avec totaux, encaissement (`<TreasuryAccountSelector>`), détail des
 * règlements par ligne dépliée, annulation d'un règlement avec motif, part
 * du négociateur.
 */
export const SaleCommissions: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [status, setStatus] = useState<SaleCommissionStatus | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data,
    isPending,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('sale-commissions', tenantId, { status }),
    queryFn: () => listSaleCommissions(tenantId as string, { status }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  const {
    data: detail,
    isPending: detailLoading,
    refetch: refetchDetail
  } = useQuery({
    queryKey: queryKey('sale-commission-detail', tenantId, { id: expandedId }),
    queryFn: () => getSaleCommission(tenantId as string, expandedId as string),
    enabled: Boolean(tenantId && expandedId),
    staleTime: STALE_TIME.list
  });

  // --- Encaissement ------------------------------------------------------------
  const [payForm] = Form.useForm<PaymentFormValues>();
  const [payCommission, setPayCommission] = useState<SaleCommissionDto | null>(null);
  const [paying, setPaying] = useState(false);
  const paymentMethod = Form.useWatch('paymentMethod', payForm);

  const ouvrirEncaissement = (commission: SaleCommissionDto) => {
    payForm.resetFields();
    payForm.setFieldsValue({ paidAt: dayjs(), paymentMethod: 'CASH', amount: commission.remainingAmount });
    setPayCommission(commission);
  };

  const encaisser = async (values: PaymentFormValues) => {
    if (!tenantId || !payCommission) return;
    setPaying(true);
    try {
      const input: CreateSaleCommissionPaymentInput = {
        amount: values.amount,
        paidAt: values.paidAt.format('YYYY-MM-DD'),
        paymentMethod: values.paymentMethod as CreateSaleCommissionPaymentInput['paymentMethod'],
        treasuryAccountId: values.treasuryAccountId,
        reference: values.reference?.trim() || null
      };
      const payment = await createSaleCommissionPayment(tenantId, payCommission.id, input);
      message.success(t('Règlement {{number}} enregistré.', { number: payment.number }));
      setPayCommission(null);
      refetch();
      if (expandedId === payCommission.id) refetchDetail();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'encaissement a échoué."));
    } finally {
      setPaying(false);
    }
  };

  // --- Annulation d'un règlement -------------------------------------------
  const [voidPayment, setVoidPayment] = useState<SaleCommissionPaymentDto | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  const annulerReglement = async () => {
    if (!tenantId || !voidPayment || voidReason.trim().length < 3) {
      message.error(t('Indiquez un motif d’au moins 3 caractères.'));
      return;
    }
    setVoiding(true);
    try {
      await voidSaleCommissionPayment(tenantId, voidPayment.id, voidReason.trim());
      message.success(t('Règlement annulé.'));
      setVoidPayment(null);
      setVoidReason('');
      refetch();
      refetchDetail();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('L’annulation a échoué.'));
    } finally {
      setVoiding(false);
    }
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const items = data?.items ?? [];
  const totals = data?.totals ?? { amountInclTax: 0, paidAmount: 0, remainingAmount: 0 };

  const colonnes: ColumnsType<SaleCommissionDto> = [
    { title: t('Numéro'), key: 'numero', render: (_, c) => c.number },
    {
      title: t('Compromis'),
      key: 'compromis',
      render: (_, c) => <Link to={`/tenant/${tenantId}/sales/agreements/${c.agreementId}`}>{c.agreementNumber}</Link>
    },
    { title: t('Bien'), key: 'bien', render: (_, c) => c.propertyLabel },
    { title: t('Payeur'), key: 'payeur', render: (_, c) => c.payerName },
    { title: t('Montant TTC'), key: 'ttc', align: 'end', render: (_, c) => <MoneyValue value={c.amountInclTax} /> },
    { title: t('Encaissé'), key: 'paye', align: 'end', render: (_, c) => <MoneyValue value={c.paidAmount} /> },
    { title: t('Reste dû'), key: 'reste', align: 'end', render: (_, c) => <MoneyValue value={c.remainingAmount} /> },
    { title: t('Négociateur'), key: 'negociateur', render: (_, c) => c.agentName ?? '—' },
    {
      title: t('Part du négociateur'),
      key: 'part-negociateur',
      align: 'end',
      render: (_, c) => <MoneyValue value={c.agentShareEarned} />
    },
    { title: t('Statut'), key: 'statut', render: (_, c) => <SaleStatusTag kind="commission" status={c.status} /> },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, c) =>
        c.status !== 'CANCELLED' && c.remainingAmount > 0 ? (
          <Button size="small" type="primary" onClick={() => ouvrirEncaissement(c)}>
            {t('Encaisser')}
          </Button>
        ) : null
    }
  ];

  const colonnesPaiements: ColumnsType<SaleCommissionPaymentDto> = [
    { title: t('Numéro'), key: 'numero', render: (_, p) => p.number },
    { title: t('Date'), key: 'date', render: (_, p) => dateCourte(p.paidAt) },
    { title: t('Montant'), key: 'montant', align: 'end', render: (_, p) => <MoneyValue value={p.amount} /> },
    {
      title: t('Moyen'),
      key: 'moyen',
      render: (_, p) => SALE_PAYMENT_METHOD_LABELS[p.paymentMethod] ?? p.paymentMethod
    },
    { title: t('Compte'), key: 'compte', render: (_, p) => p.treasuryAccountLabel },
    { title: t('Référence'), key: 'reference', render: (_, p) => p.reference ?? '—' },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, p) => (
        <span>
          <SaleStatusTag kind="payment" status={p.status} />
          {p.voidReason && (
            <Text type="secondary" style={{ display: 'block', fontSize: 'var(--font-size-caption)' }}>
              {p.voidReason}
            </Text>
          )}
        </span>
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, p) =>
        p.status === 'POSTED' ? (
          <Button
            danger
            size="small"
            onClick={() => {
              setVoidPayment(p);
              setVoidReason('');
            }}
          >
            {t('Annuler')}
          </Button>
        ) : null
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Commissions de vente')}
        breadcrumbs={[{ label: t('Ventes'), to: `/tenant/${tenantId}/sales` }, { label: t('Commissions de vente') }]}
        extra={
          <Select
            allowClear
            placeholder={t('Statut')}
            style={{ width: 200 }}
            value={status}
            onChange={value => setStatus(value)}
            showSearch
            optionFilterProp="label"
            options={STATUS_OPTIONS}
          />
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-3)',
          marginBottom: 'var(--space-6)'
        }}
      >
        <StatCard label={t('Total TTC')} value={<MoneyValue value={totals.amountInclTax} />} />
        <StatCard label={t('Encaissé')} value={<MoneyValue value={totals.paidAmount} />} tone="positive" />
        <StatCard label={t('Reste dû')} value={<MoneyValue value={totals.remainingAmount} />} tone="warning" />
      </div>

      {erreurRequete ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger les commissions de vente.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetch(), primary: true }]}
        />
      ) : (
        <Table<SaleCommissionDto>
          dataSource={items}
          loading={isPending}
          columns={colonnes}
          rowKey={c => c.id}
          pagination={false}
          locale={{ emptyText: t('Aucune commission de vente.') }}
          expandable={{
            expandedRowKeys: expandedId ? [expandedId] : [],
            onExpand: (expanded, record) => setExpandedId(expanded ? record.id : null),
            expandedRowRender: () =>
              detailLoading ? (
                <Text type="secondary">{t('Chargement des règlements…')}</Text>
              ) : (
                <Table<SaleCommissionPaymentDto>
                  size="small"
                  dataSource={detail?.payments ?? []}
                  columns={colonnesPaiements}
                  rowKey={p => p.id}
                  pagination={false}
                  locale={{ emptyText: t('Aucun règlement enregistré.') }}
                />
              )
          }}
        />
      )}

      {/* Encaissement */}
      <Modal
        title={payCommission ? t('Encaisser — {{number}}', { number: payCommission.number }) : ''}
        open={Boolean(payCommission)}
        onCancel={() => setPayCommission(null)}
        onOk={() => payForm.submit()}
        confirmLoading={paying}
        okText={t('Encaisser')}
        cancelText={t('Annuler')}
        destroyOnClose
      >
        <Form<PaymentFormValues>
          form={payForm}
          layout="vertical"
          onFinish={encaisser}
          onFinishFailed={onAntFormValidationFailed(payForm)}
        >
          <Form.Item
            label={t('Montant')}
            name="amount"
            rules={[
              { required: true, message: t('Le montant est requis') },
              { type: 'number', min: 0.01, message: t('Le montant doit être supérieur à 0') }
            ]}
          >
            <InputNumber style={{ width: '100%' }} min={0.01} {...montantSaisiProps} />
          </Form.Item>
          <Form.Item label={t('Date du règlement')} name="paidAt" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label={t('Moyen de paiement')} name="paymentMethod" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={Object.entries(SALE_PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item
            label={t('Compte de trésorerie')}
            name="treasuryAccountId"
            rules={[{ required: true, message: t('Le compte de trésorerie est requis') }]}
          >
            <TreasuryAccountSelector tenantId={tenantId} paymentMethod={paymentMethod} />
          </Form.Item>
          <Form.Item label={t('Référence')} name="reference">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Annulation d'un règlement */}
      <Modal
        title={t('Annuler le règlement')}
        open={Boolean(voidPayment)}
        onCancel={() => setVoidPayment(null)}
        onOk={annulerReglement}
        confirmLoading={voiding}
        okText={t('Annuler le règlement')}
        okButtonProps={{ danger: true }}
        cancelText={t('Fermer')}
      >
        <Text>{t('Motif d’annulation')}</Text>
        <TextArea
          rows={3}
          style={{ marginTop: 'var(--space-2)' }}
          value={voidReason}
          onChange={e => setVoidReason(e.target.value)}
        />
      </Modal>
    </>
  );
};

export default SaleCommissions;
