import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Space,
  Table,
  Tabs,
  Typography
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import {
  createSaleAgreementFromOffer,
  createSaleOffer,
  decideSaleOffer,
  getSaleMandate,
  revokeSaleMandate
} from '../../services/sales-service';
import type {
  CreateSaleAgreementInput,
  CreateSaleOfferInput,
  SaleOfferAction,
  SaleOfferDto
} from '../../services/sales-service';
import { detailKey, STALE_TIME } from '../../lib/query-keys';
import { MoneyValue, PageHeader, StateBlock, StatusTag } from '../../components/primitives';
import { montantSaisiProps } from '../../utils/montant-saisi';
import { BuyerContactSelect, DealSelect } from './selectors';
import {
  COMMISSION_PAYER_LABELS,
  DEPOSIT_HOLDER_LABELS,
  FINANCING_LABELS,
  MANDATE_TYPE_LABELS,
  dateCourte
} from './helpers';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { t } from '../../i18n/t';
import { SaleStatusTag } from './SaleStatusTag';

const { Text, Title } = Typography;
const { TextArea } = Input;

interface OfferFormValues {
  buyerContactId: string;
  dealId?: string | null;
  amount: number;
  financing: 'CASH' | 'LOAN' | 'MIXED';
  conditions?: string;
  validUntil?: dayjs.Dayjs | null;
}

interface AgreementFormValues {
  price?: number | null;
  depositAmount?: number | null;
  depositHolder?: 'NOTARY' | 'SELLER' | null;
  notaryName?: string;
  expectedDeedDate?: dayjs.Dayjs | null;
}

/**
 * Fiche mandat de vente — lot 9 (PRD §5.3).
 *
 * En-tête (prix, honoraires, dates, co-vendeurs), onglets Offres (saisie,
 * contre-offre, accepter, refuser, retirer), Compromis (création depuis
 * l'offre acceptée) et Historique.
 */
export const SaleMandateDetail: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, id } = useParams<{ tenantId: string; id: string }>();
  const navigate = useNavigate();

  const {
    data: mandate,
    isPending,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: detailKey('sale-mandates', tenantId, id ?? ''),
    queryFn: () => getSaleMandate(tenantId as string, id as string),
    enabled: Boolean(tenantId && id),
    staleTime: STALE_TIME.list
  });

  // --- Révocation du mandat -------------------------------------------------
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const [revoking, setRevoking] = useState(false);

  const revoquer = async () => {
    if (!tenantId || !id || revokeReason.trim().length < 3) {
      message.error(t('Indiquez un motif d’au moins 3 caractères.'));
      return;
    }
    setRevoking(true);
    try {
      await revokeSaleMandate(tenantId, id, revokeReason.trim());
      message.success(t('Mandat révoqué.'));
      setRevokeOpen(false);
      setRevokeReason('');
      refetch();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La révocation a échoué.'));
    } finally {
      setRevoking(false);
    }
  };

  // --- Nouvelle offre --------------------------------------------------------
  const [offerForm] = Form.useForm<OfferFormValues>();
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [creatingOffer, setCreatingOffer] = useState(false);

  const ouvrirNouvelleOffre = () => {
    offerForm.resetFields();
    offerForm.setFieldsValue({ financing: 'CASH' });
    setOfferModalOpen(true);
  };

  const soumettreOffre = async (values: OfferFormValues) => {
    if (!tenantId || !id) return;
    setCreatingOffer(true);
    try {
      const input: CreateSaleOfferInput = {
        buyerContactId: values.buyerContactId,
        dealId: values.dealId ?? null,
        amount: values.amount,
        financing: values.financing,
        conditions: values.conditions?.trim() || null,
        validUntil: values.validUntil ? values.validUntil.format('YYYY-MM-DD') : null
      };
      const offer = await createSaleOffer(tenantId, id, input);
      message.success(t('Offre {{number}} enregistrée.', { number: offer.number }));
      setOfferModalOpen(false);
      refetch();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement de l'offre a échoué."));
    } finally {
      setCreatingOffer(false);
    }
  };

  // --- Décision sur une offre ------------------------------------------------
  const [decisionOffer, setDecisionOffer] = useState<SaleOfferDto | null>(null);
  const [decisionAction, setDecisionAction] = useState<SaleOfferAction | null>(null);
  const [decisionAmount, setDecisionAmount] = useState<number | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionSaving, setDecisionSaving] = useState(false);

  const ouvrirDecision = (offer: SaleOfferDto, action: SaleOfferAction) => {
    setDecisionOffer(offer);
    setDecisionAction(action);
    setDecisionAmount(null);
    setDecisionReason('');
  };

  const confirmerDecision = async () => {
    if (!tenantId || !decisionOffer || !decisionAction) return;
    if (decisionAction === 'COUNTER' && (!decisionAmount || decisionAmount <= 0)) {
      message.error(t('Indiquez le montant de la contre-offre.'));
      return;
    }
    if ((decisionAction === 'REJECT' || decisionAction === 'WITHDRAW') && decisionReason.trim().length < 3) {
      message.error(t('Indiquez un motif d’au moins 3 caractères.'));
      return;
    }
    setDecisionSaving(true);
    try {
      await decideSaleOffer(tenantId, decisionOffer.id, {
        action: decisionAction,
        counterAmount: decisionAction === 'COUNTER' ? decisionAmount : undefined,
        reason: decisionAction === 'REJECT' || decisionAction === 'WITHDRAW' ? decisionReason.trim() : undefined
      });
      message.success(t('Décision enregistrée.'));
      setDecisionOffer(null);
      setDecisionAction(null);
      refetch();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement de la décision a échoué."));
    } finally {
      setDecisionSaving(false);
    }
  };

  // --- Création du compromis depuis une offre acceptée -----------------------
  const [agreementForm] = Form.useForm<AgreementFormValues>();
  const [agreementOffer, setAgreementOffer] = useState<SaleOfferDto | null>(null);
  const [creatingAgreement, setCreatingAgreement] = useState(false);

  const ouvrirCreationCompromis = (offer: SaleOfferDto) => {
    agreementForm.resetFields();
    agreementForm.setFieldsValue({ price: offer.agreedPrice ?? offer.amount, depositHolder: 'NOTARY' });
    setAgreementOffer(offer);
  };

  const soumettreCompromis = async (values: AgreementFormValues) => {
    if (!tenantId || !agreementOffer) return;
    setCreatingAgreement(true);
    try {
      const input: CreateSaleAgreementInput = {
        price: values.price ?? null,
        depositAmount: values.depositAmount ?? null,
        depositHolder: values.depositHolder ?? null,
        notaryName: values.notaryName?.trim() || null,
        expectedDeedDate: values.expectedDeedDate ? values.expectedDeedDate.format('YYYY-MM-DD') : null
      };
      const agreement = await createSaleAgreementFromOffer(tenantId, agreementOffer.id, input);
      message.success(t('Compromis {{number}} créé.', { number: agreement.number }));
      setAgreementOffer(null);
      navigate(`/tenant/${tenantId}/sales/agreements/${agreement.id}`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La création du compromis a échoué.'));
    } finally {
      setCreatingAgreement(false);
    }
  };

  if (!tenantId || !id) {
    return <StateBlock variant="empty" title={t('Aucun mandat sélectionné')} />;
  }

  const filAriane = [
    { label: t('Ventes'), to: `/tenant/${tenantId}/sales` },
    { label: t('Mandats de vente'), to: `/tenant/${tenantId}/sales/mandates` }
  ];

  if (erreurRequete) {
    return (
      <>
        <PageHeader title={t('Mandat de vente')} breadcrumbs={filAriane} />
        <StateBlock
          variant="error"
          description={t('Impossible de charger ce mandat.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetch(), primary: true }]}
        />
      </>
    );
  }

  if (isPending || !mandate) {
    return <StateBlock variant="loading" />;
  }

  // Un mandat vendu ou révoqué est clos : ses offres ne se décident plus.
  const mandatActif = mandate.status === 'ACTIVE';
  const peutRevoquer = mandatActif && !mandate.agreements.some(agreement => agreement.status === 'SIGNED');

  const colonnesOffres: ColumnsType<SaleOfferDto> = [
    { title: t('Numéro'), key: 'numero', render: (_, o) => o.number },
    { title: t('Acquéreur'), key: 'acquereur', render: (_, o) => o.buyerName },
    { title: t('Montant'), key: 'montant', align: 'end', render: (_, o) => <MoneyValue value={o.amount} /> },
    {
      title: t('Contre-offre'),
      key: 'contre-offre',
      align: 'end',
      render: (_, o) => (o.counterAmount != null ? <MoneyValue value={o.counterAmount} /> : '—')
    },
    { title: t('Financement'), key: 'financement', render: (_, o) => FINANCING_LABELS[o.financing] },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, o) => (
        <SaleStatusTag
          kind="offer"
          status={o.isExpired && (o.status === 'SUBMITTED' || o.status === 'COUNTERED') ? 'EXPIRED' : o.status}
        />
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, o) => (
        <Space wrap size="small">
          {mandatActif && (o.status === 'SUBMITTED' || o.status === 'COUNTERED') && (
            <>
              <Button size="small" onClick={() => ouvrirDecision(o, 'COUNTER')}>
                {t('Contre-offre')}
              </Button>
              <Button size="small" type="primary" onClick={() => ouvrirDecision(o, 'ACCEPT')}>
                {t('Accepter')}
              </Button>
              <Button size="small" danger onClick={() => ouvrirDecision(o, 'REJECT')}>
                {t('Refuser')}
              </Button>
            </>
          )}
          {mandatActif && o.status === 'ACCEPTED' && !o.agreementId && (
            <>
              <Button size="small" type="primary" onClick={() => ouvrirCreationCompromis(o)}>
                {t('Créer le compromis')}
              </Button>
              <Button size="small" danger onClick={() => ouvrirDecision(o, 'WITHDRAW')}>
                {t('Retirer')}
              </Button>
            </>
          )}
          {o.agreementId && (
            <Link to={`/tenant/${tenantId}/sales/agreements/${o.agreementId}`}>{t('Voir le compromis')}</Link>
          )}
        </Space>
      )
    }
  ];

  const onglets = [
    {
      key: 'offres',
      label: t('Offres'),
      children: (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-3)' }}>
            <Button icon={<PlusOutlined />} onClick={ouvrirNouvelleOffre} disabled={!mandatActif}>
              {t('Nouvelle offre')}
            </Button>
          </div>
          <Table<SaleOfferDto>
            dataSource={mandate.offers}
            columns={colonnesOffres}
            rowKey={o => o.id}
            pagination={false}
            locale={{ emptyText: t('Aucune offre pour ce mandat.') }}
          />
        </>
      )
    },
    {
      key: 'compromis',
      label: t('Compromis'),
      children:
        mandate.agreements.length === 0 ? (
          <StateBlock
            variant="empty"
            description={t(
              "Aucun compromis pour ce mandat : créez-le depuis l'onglet Offres, une fois une offre acceptée."
            )}
          />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {mandate.agreements.map(agreement => (
              <Card key={agreement.id} size="small">
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space direction="vertical" size={0}>
                    <Text strong>{agreement.number}</Text>
                    <Text type="secondary">
                      <MoneyValue value={agreement.price} /> · {agreement.buyerName}
                    </Text>
                  </Space>
                  <Space>
                    <SaleStatusTag kind="agreement" status={agreement.status} />
                    <Link to={`/tenant/${tenantId}/sales/agreements/${agreement.id}`}>{t('Ouvrir')}</Link>
                  </Space>
                </Space>
              </Card>
            ))}
          </Space>
        )
    },
    {
      key: 'historique',
      label: t('Historique'),
      children: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>{t('Mandat créé le {{date}}.', { date: dateCourte(mandate.createdAt) })}</Text>
          {mandate.revokedAt && (
            <Text type="danger">
              {t('Révoqué le {{date}} — {{motif}}', {
                date: dateCourte(mandate.revokedAt),
                motif: mandate.revokeReason ?? ''
              })}
            </Text>
          )}
        </Space>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title={mandate.number}
        subtitle={mandate.propertyLabel}
        breadcrumbs={[...filAriane, { label: mandate.number }]}
        secondaryActions={
          peutRevoquer
            ? [{ key: 'revoke', label: t('Révoquer le mandat'), danger: true, onClick: () => setRevokeOpen(true) }]
            : undefined
        }
      />

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
          <Descriptions.Item label={t('Bien')}>{mandate.propertyLabel}</Descriptions.Item>
          <Descriptions.Item label={t('Vendeur')}>{mandate.sellerName}</Descriptions.Item>
          <Descriptions.Item label={t('Type')}>{MANDATE_TYPE_LABELS[mandate.mandateType]}</Descriptions.Item>
          <Descriptions.Item label={t('Statut')}>
            <SaleStatusTag
              kind="mandate"
              status={mandate.isExpired && mandate.status === 'ACTIVE' ? 'EXPIRED' : mandate.status}
            />
          </Descriptions.Item>
          <Descriptions.Item label={t('Prix demandé')}>
            <MoneyValue value={mandate.askingPrice} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Prix plancher')}>
            {mandate.minimumPrice != null ? <MoneyValue value={mandate.minimumPrice} /> : '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('Honoraires')}>
            {mandate.commissionMode === 'PERCENT'
              ? t('{{rate}} % ({{payer}})', {
                  rate: mandate.commissionRate ?? '—',
                  payer: COMMISSION_PAYER_LABELS[mandate.commissionPayer]
                })
              : t('Forfait {{amount}} ({{payer}})', {
                  amount: mandate.commissionFixedAmount ?? '—',
                  payer: COMMISSION_PAYER_LABELS[mandate.commissionPayer]
                })}
          </Descriptions.Item>
          <Descriptions.Item label={t('Négociateur')}>{mandate.agentName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Début')}>{dateCourte(mandate.startDate)}</Descriptions.Item>
          <Descriptions.Item label={t('Échéance')}>{dateCourte(mandate.endDate)}</Descriptions.Item>
          {mandate.notes && (
            <Descriptions.Item label={t('Notes')} span={2}>
              {mandate.notes}
            </Descriptions.Item>
          )}
        </Descriptions>

        {mandate.coSellers.length > 0 && (
          <>
            <Title level={5} style={{ marginTop: 'var(--space-4)' }}>
              {t('Co-vendeurs (indivision)')}
            </Title>
            <Table
              size="small"
              pagination={false}
              dataSource={mandate.coSellers}
              rowKey={c => c.clientId}
              columns={[
                { title: t('Indivisaire'), dataIndex: 'name', key: 'name' },
                { title: t('Quote-part'), dataIndex: 'sharePercent', key: 'share', render: v => `${v} %` }
              ]}
            />
          </>
        )}
      </Card>

      <Tabs items={onglets} />

      {/* Révocation du mandat */}
      <Modal
        title={t('Révoquer le mandat')}
        open={revokeOpen}
        onCancel={() => setRevokeOpen(false)}
        onOk={revoquer}
        confirmLoading={revoking}
        okText={t('Révoquer')}
        okButtonProps={{ danger: true }}
        cancelText={t('Annuler')}
      >
        <Text>{t('Motif de révocation')}</Text>
        <TextArea
          rows={3}
          style={{ marginTop: 'var(--space-2)' }}
          value={revokeReason}
          onChange={e => setRevokeReason(e.target.value)}
        />
      </Modal>

      {/* Nouvelle offre */}
      <Modal
        title={t('Nouvelle offre')}
        open={offerModalOpen}
        onCancel={() => setOfferModalOpen(false)}
        onOk={() => offerForm.submit()}
        confirmLoading={creatingOffer}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        destroyOnClose
      >
        <Form<OfferFormValues>
          form={offerForm}
          layout="vertical"
          onFinish={soumettreOffre}
          onFinishFailed={onAntFormValidationFailed(offerForm)}
        >
          <Form.Item
            label={t('Acquéreur')}
            name="buyerContactId"
            rules={[{ required: true, message: t("L'acquéreur est requis") }]}
          >
            <BuyerContactSelect tenantId={tenantId} />
          </Form.Item>
          <Form.Item label={t("Affaire CRM d'origine")} name="dealId">
            <DealSelect tenantId={tenantId} />
          </Form.Item>
          <Form.Item
            label={t('Montant')}
            name="amount"
            rules={[
              { required: true, message: t('Le montant est requis') },
              { type: 'number', min: 1, message: t('Le montant doit être supérieur à 0') }
            ]}
          >
            <InputNumber style={{ width: '100%' }} min={1} {...montantSaisiProps} />
          </Form.Item>
          <Form.Item label={t('Financement')} name="financing" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio value="CASH">{FINANCING_LABELS.CASH}</Radio>
              <Radio value="LOAN">{FINANCING_LABELS.LOAN}</Radio>
              <Radio value="MIXED">{FINANCING_LABELS.MIXED}</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label={t('Valable jusqu’au')} name="validUntil">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label={t('Conditions')} name="conditions">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Décision sur une offre */}
      <Modal
        title={
          decisionAction
            ? t('{{action}} — offre {{number}}', {
                action:
                  decisionAction === 'COUNTER'
                    ? t('Contre-offre')
                    : decisionAction === 'ACCEPT'
                      ? t('Accepter')
                      : decisionAction === 'REJECT'
                        ? t('Refuser')
                        : t('Retirer'),
                number: decisionOffer?.number ?? ''
              })
            : ''
        }
        open={Boolean(decisionOffer && decisionAction)}
        onCancel={() => {
          setDecisionOffer(null);
          setDecisionAction(null);
        }}
        onOk={confirmerDecision}
        confirmLoading={decisionSaving}
        okText={t('Confirmer')}
        okButtonProps={{ danger: decisionAction === 'REJECT' || decisionAction === 'WITHDRAW' }}
        cancelText={t('Annuler')}
      >
        {decisionAction === 'COUNTER' && (
          <>
            <Text>{t('Montant de la contre-offre')}</Text>
            <InputNumber
              style={{ width: '100%', marginTop: 'var(--space-2)' }}
              min={1}
              {...montantSaisiProps}
              value={decisionAmount ?? undefined}
              onChange={value => setDecisionAmount((value as number) ?? null)}
            />
          </>
        )}
        {decisionAction === 'ACCEPT' && (
          <Text>{t('Confirmer l’acceptation de cette offre ? Le bien passera « Réservé ».')}</Text>
        )}
        {(decisionAction === 'REJECT' || decisionAction === 'WITHDRAW') && (
          <>
            <Text>{t('Motif')}</Text>
            <TextArea
              rows={3}
              style={{ marginTop: 'var(--space-2)' }}
              value={decisionReason}
              onChange={e => setDecisionReason(e.target.value)}
            />
          </>
        )}
      </Modal>

      {/* Création du compromis */}
      <Modal
        title={t('Créer le compromis')}
        open={Boolean(agreementOffer)}
        onCancel={() => setAgreementOffer(null)}
        onOk={() => agreementForm.submit()}
        confirmLoading={creatingAgreement}
        okText={t('Créer')}
        cancelText={t('Annuler')}
        destroyOnClose
      >
        <Form<AgreementFormValues>
          form={agreementForm}
          layout="vertical"
          onFinish={soumettreCompromis}
          onFinishFailed={onAntFormValidationFailed(agreementForm)}
        >
          <Form.Item label={t('Prix convenu')} name="price">
            <InputNumber style={{ width: '100%' }} min={1} {...montantSaisiProps} />
          </Form.Item>
          <Form.Item label={t('Dépôt de l’acquéreur')} name="depositAmount">
            <InputNumber style={{ width: '100%' }} min={0} {...montantSaisiProps} />
          </Form.Item>
          <Form.Item label={t('Dépôt détenu par')} name="depositHolder">
            <Radio.Group>
              <Radio value="NOTARY">{DEPOSIT_HOLDER_LABELS.NOTARY}</Radio>
              <Radio value="SELLER">{DEPOSIT_HOLDER_LABELS.SELLER}</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label={t('Notaire')} name="notaryName">
            <Input />
          </Form.Item>
          <Form.Item label={t('Date prévue de l’acte')} name="expectedDeedDate">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default SaleMandateDetail;
