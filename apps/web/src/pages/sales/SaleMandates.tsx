import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, DatePicker, Form, Input, InputNumber, Modal, Radio, Select, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { createSaleMandate, listSaleMandates } from '../../services/sales-service';
import type {
  CreateSaleMandateInput,
  SaleCommissionMode,
  SaleMandateDto,
  SaleMandateStatus
} from '../../services/sales-service';
import { queryKey, STALE_TIME } from '../../lib/query-keys';
import { PageHeader, StateBlock, MoneyValue, DataView, DataCard, StatusTag } from '../../components/primitives';
import { montantSaisiProps } from '../../utils/montant-saisi';
import { AgentSelect, PropertySelect, SellerClientSelect } from './selectors';
import { COMMISSION_PAYER_LABELS, MANDATE_TYPE_LABELS } from './helpers';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { t } from '../../i18n/t';
import { SaleStatusTag } from './SaleStatusTag';

const STATUS_OPTIONS: { value: SaleMandateStatus; label: string }[] = [
  { value: 'ACTIVE', label: t('Actif') },
  { value: 'REVOKED', label: t('Révoqué') },
  { value: 'COMPLETED', label: t('Terminé') }
];

interface MandateFormValues {
  propertyId: string;
  sellerClientId: string;
  mandateType: 'SIMPLE' | 'EXCLUSIVE';
  askingPrice: number;
  minimumPrice?: number | null;
  commissionMode: SaleCommissionMode;
  commissionRate?: number | null;
  commissionFixedAmount?: number | null;
  commissionPayer: 'SELLER' | 'BUYER';
  agentUserId?: string | null;
  agentSharePercent?: number | null;
  period: [dayjs.Dayjs, dayjs.Dayjs | null];
  notes?: string;
}

/**
 * Mandats de vente — lot 9 (PRD §5.2).
 *
 * Liste filtrable (statut, recherche) et modale « Nouveau mandat » avec ses
 * sélecteurs cherchables. `?new=1[&propertyId=…]` ouvre la modale directement,
 * préremplie — c'est le lien que pose l'encart « Vente » de la fiche bien
 * quand aucun mandat n'existe encore.
 */
export const SaleMandates: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form] = Form.useForm<MandateFormValues>();

  const [status, setStatus] = useState<SaleMandateStatus | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    data,
    isPending,
    isFetching,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: queryKey('sale-mandates', tenantId, { status, search }),
    queryFn: () => listSaleMandates(tenantId as string, { status, search: search || undefined }),
    enabled: Boolean(tenantId),
    staleTime: STALE_TIME.list
  });

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      ouvrirModale();
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ouvrirModale = () => {
    form.resetFields();
    form.setFieldsValue({
      mandateType: 'SIMPLE',
      commissionMode: 'PERCENT',
      commissionPayer: 'SELLER',
      period: [dayjs(), null],
      propertyId: searchParams.get('propertyId') || undefined
    } as Partial<MandateFormValues>);
    setModalOpen(true);
  };

  const commissionMode = Form.useWatch('commissionMode', form);

  const soumettre = async (values: MandateFormValues) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const input: CreateSaleMandateInput = {
        propertyId: values.propertyId,
        sellerClientId: values.sellerClientId,
        mandateType: values.mandateType,
        askingPrice: values.askingPrice,
        minimumPrice: values.minimumPrice ?? null,
        commissionMode: values.commissionMode,
        commissionRate: values.commissionMode === 'PERCENT' ? (values.commissionRate ?? null) : null,
        commissionFixedAmount: values.commissionMode === 'FIXED' ? (values.commissionFixedAmount ?? null) : null,
        commissionPayer: values.commissionPayer,
        agentUserId: values.agentUserId ?? null,
        agentSharePercent: values.agentSharePercent ?? null,
        startDate: values.period[0].format('YYYY-MM-DD'),
        endDate: values.period[1] ? values.period[1].format('YYYY-MM-DD') : null,
        notes: values.notes?.trim() || null
      };
      const mandate = await createSaleMandate(tenantId, input);
      message.success(t('Mandat {{number}} créé.', { number: mandate.number }));
      setModalOpen(false);
      navigate(`/tenant/${tenantId}/sales/mandates/${mandate.id}`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La création du mandat a échoué.'));
    } finally {
      setSaving(false);
    }
  };

  if (!tenantId) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  const items = data ?? [];
  const estFiltre = Boolean(status || search);

  const colonnes: ColumnsType<SaleMandateDto> = [
    {
      title: t('Numéro'),
      key: 'numero',
      render: (_, m) => <Link to={`/tenant/${tenantId}/sales/mandates/${m.id}`}>{m.number}</Link>
    },
    { title: t('Bien'), key: 'bien', render: (_, m) => m.propertyLabel },
    { title: t('Vendeur'), key: 'vendeur', render: (_, m) => m.sellerName },
    { title: t('Prix demandé'), key: 'prix', align: 'end', render: (_, m) => <MoneyValue value={m.askingPrice} /> },
    { title: t('Type'), key: 'type', render: (_, m) => MANDATE_TYPE_LABELS[m.mandateType] },
    { title: t('Offres'), key: 'offres', align: 'end', render: (_, m) => m.offersCount },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, m) => (
        <SaleStatusTag kind="mandate" status={m.isExpired && m.status === 'ACTIVE' ? 'EXPIRED' : m.status} />
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={t('Mandats de vente')}
        breadcrumbs={[{ label: t('Ventes'), to: `/tenant/${tenantId}/sales` }, { label: t('Mandats de vente') }]}
        primaryAction={{ label: t('Nouveau mandat'), onClick: ouvrirModale }}
        extra={
          <Space wrap>
            <Input.Search
              allowClear
              placeholder={t('Rechercher un bien ou un vendeur')}
              style={{ width: 260 }}
              onSearch={value => setSearch(value)}
            />
            <Select
              allowClear
              placeholder={t('Statut')}
              style={{ width: 160 }}
              value={status}
              onChange={value => setStatus(value)}
              showSearch
              optionFilterProp="label"
              options={STATUS_OPTIONS}
            />
          </Space>
        }
      />

      <DataView<SaleMandateDto>
        paginated={false}
        items={items}
        total={items.length}
        page={1}
        pageSize={Math.max(items.length, 1)}
        onPageChange={() => {}}
        loading={isPending}
        isReloading={isFetching && !isPending}
        error={erreurRequete ? t('Impossible de charger les mandats de vente.') : null}
        onRetry={() => refetch()}
        isFiltered={estFiltre}
        onClearFilters={() => {
          setStatus(undefined);
          setSearch('');
        }}
        emptyDescription={t('Aucun mandat de vente enregistré.')}
        emptyAction={{ label: t('Nouveau mandat'), onClick: ouvrirModale }}
        columns={colonnes}
        rowKey={m => m.id}
        aria-label={t('Mandats de vente')}
        renderCard={m => (
          <DataCard
            title={m.propertyLabel}
            subtitle={`${m.number} · ${m.sellerName}`}
            highlight={<MoneyValue value={m.askingPrice} />}
            fields={[
              { label: t('Type'), value: MANDATE_TYPE_LABELS[m.mandateType] },
              {
                label: t('Statut'),
                value: (
                  <SaleStatusTag kind="mandate" status={m.isExpired && m.status === 'ACTIVE' ? 'EXPIRED' : m.status} />
                )
              }
            ]}
            onOpen={() => navigate(`/tenant/${tenantId}/sales/mandates/${m.id}`)}
          />
        )}
      />

      <Modal
        title={t('Nouveau mandat de vente')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={t('Créer le mandat')}
        cancelText={t('Annuler')}
        destroyOnClose
        width={640}
      >
        <Form<MandateFormValues>
          form={form}
          layout="vertical"
          onFinish={soumettre}
          onFinishFailed={onAntFormValidationFailed(form)}
        >
          <Form.Item label={t('Bien')} name="propertyId" rules={[{ required: true, message: t('Le bien est requis') }]}>
            <PropertySelect tenantId={tenantId} />
          </Form.Item>

          <Form.Item
            label={t('Vendeur (propriétaire)')}
            name="sellerClientId"
            rules={[{ required: true, message: t('Le vendeur est requis') }]}
          >
            <SellerClientSelect tenantId={tenantId} />
          </Form.Item>

          <Form.Item label={t('Type de mandat')} name="mandateType" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="SIMPLE">{t('Simple')}</Radio>
              <Radio value="EXCLUSIVE">{t('Exclusif')}</Radio>
            </Radio.Group>
          </Form.Item>

          <Space.Compact block>
            <Form.Item
              label={t('Prix demandé')}
              name="askingPrice"
              style={{ width: '50%' }}
              rules={[
                { required: true, message: t('Le prix demandé est requis') },
                { type: 'number', min: 1, message: t('Le prix doit être supérieur à 0') }
              ]}
            >
              <InputNumber style={{ width: '100%' }} min={1} {...montantSaisiProps} />
            </Form.Item>
            <Form.Item label={t('Prix plancher (confidentiel)')} name="minimumPrice" style={{ width: '50%' }}>
              <InputNumber style={{ width: '100%' }} min={0} {...montantSaisiProps} />
            </Form.Item>
          </Space.Compact>

          <Form.Item label={t('Honoraires — mode')} name="commissionMode" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="PERCENT">{t('Pourcentage')}</Radio>
              <Radio value="FIXED">{t('Forfait')}</Radio>
            </Radio.Group>
          </Form.Item>

          {commissionMode === 'FIXED' ? (
            <Form.Item
              label={t('Forfait des honoraires')}
              name="commissionFixedAmount"
              rules={[{ required: true, message: t('Le forfait est requis') }]}
            >
              <InputNumber style={{ width: '100%' }} min={0} {...montantSaisiProps} />
            </Form.Item>
          ) : (
            <Form.Item
              label={t("Taux d'honoraires (%)")}
              name="commissionRate"
              rules={[
                { required: true, message: t('Le taux est requis') },
                { type: 'number', min: 0.01, max: 20, message: t('Le taux doit être compris entre 0 et 20 %') }
              ]}
            >
              <InputNumber style={{ width: '100%' }} min={0} max={20} step={0.5} />
            </Form.Item>
          )}

          <Form.Item label={t('Honoraires à la charge de')} name="commissionPayer" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="SELLER">{COMMISSION_PAYER_LABELS.SELLER}</Radio>
              <Radio value="BUYER">{COMMISSION_PAYER_LABELS.BUYER}</Radio>
            </Radio.Group>
          </Form.Item>

          <Space.Compact block>
            <Form.Item label={t('Négociateur')} name="agentUserId" style={{ width: '60%' }}>
              <AgentSelect tenantId={tenantId} />
            </Form.Item>
            <Form.Item label={t('Part du négociateur (%)')} name="agentSharePercent" style={{ width: '40%' }}>
              <InputNumber style={{ width: '100%' }} min={0} max={100} />
            </Form.Item>
          </Space.Compact>

          <Form.Item
            label={t('Période du mandat')}
            name="period"
            rules={[{ required: true, message: t('La date de début est requise') }]}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} allowEmpty={[false, true]} format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item label={t('Notes')} name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default SaleMandates;
