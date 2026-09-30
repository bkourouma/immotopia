import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Steps,
  Table,
  Tooltip,
  Typography
} from 'antd';
import { DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addSaleCondition,
  cancelSaleAgreement,
  completeSaleAgreement,
  deleteSaleCondition,
  getSaleAgreement,
  replaceSaleMilestones,
  signSaleAgreement,
  updateSaleAgreement,
  updateSaleCondition
} from '../../services/sales-service';
import type {
  SaleAgreementDetailDto,
  SaleConditionDto,
  SaleConditionStatus,
  SaleMilestoneDto
} from '../../services/sales-service';
import { detailKey, entityKeyPrefix, STALE_TIME } from '../../lib/query-keys';
import { MoneyValue, PageHeader, StateBlock, StatusTag } from '../../components/primitives';
import { montantSaisiProps } from '../../utils/montant-saisi';
import { DEPOSIT_HOLDER_LABELS, dateCourte } from './helpers';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { t } from '../../i18n/t';
import { SaleStatusTag } from './SaleStatusTag';

const { Text, Title } = Typography;
const { TextArea } = Input;

const CONDITION_STATUS_OPTIONS: { value: SaleConditionStatus; label: string }[] = [
  { value: 'PENDING', label: t('En attente') },
  { value: 'MET', label: t('Remplie') },
  { value: 'FAILED', label: t('Échouée') },
  { value: 'WAIVED', label: t('Levée') }
];

interface EditFormValues {
  price?: number | null;
  depositAmount?: number | null;
  depositHolder?: 'NOTARY' | 'SELLER' | null;
  notaryName?: string;
  expectedDeedDate?: dayjs.Dayjs | null;
}

interface MilestoneRow extends SaleMilestoneDto {
  /** Marque une ligne pas encore envoyée au serveur : la clé locale suffit. */
  isNew?: boolean;
}

const STEP_INDEX: Record<string, number> = { DRAFT: 0, SIGNED: 1, COMPLETED: 2 };

/**
 * Fiche compromis de vente — lot 9 (PRD §5.4).
 *
 * Étapes brouillon → signé → acte (`<Steps>` AntD), édition prix/dépôt/notaire/
 * dates, conditions suspensives CRUD, échéancier éditable (PUT liste
 * complète, avertissement si la somme dépasse le prix), bloc commission,
 * annulation avec motif.
 */
export const SaleAgreementDetail: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, id } = useParams<{ tenantId: string; id: string }>();
  const queryClient = useQueryClient();

  const {
    data: agreement,
    isPending,
    error: erreurRequete,
    refetch
  } = useQuery({
    queryKey: detailKey('sale-agreements', tenantId, id ?? ''),
    queryFn: () => getSaleAgreement(tenantId as string, id as string),
    enabled: Boolean(tenantId && id),
    staleTime: STALE_TIME.list
  });

  /**
   * Après une mutation d'état (signature, acte) : le compromis, le mandat, les
   * offres, les commissions et le tableau de bord des ventes changent tous.
   * On les invalide, puis on recharge la fiche et on ATTEND le résultat.
   */
  const rafraichirApresMutation = async (dto?: Partial<SaleAgreementDetailDto>) => {
    if (dto)
      queryClient.setQueryData(
        detailKey('sale-agreements', tenantId, id ?? ''),
        (ancien: SaleAgreementDetailDto | undefined) => (ancien ? { ...ancien, ...dto } : ancien)
      );
    for (const entite of ['sale-agreements', 'sale-mandates', 'sale-offers', 'sale-commissions', 'sales-pipeline']) {
      if (entite === 'sale-agreements') continue;
      void queryClient.invalidateQueries({ queryKey: entityKeyPrefix(entite, tenantId) });
    }
    await refetch();
  };

  // --- Édition prix / dépôt / notaire / dates -------------------------------
  const [editForm] = Form.useForm<EditFormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agreement) return;
    editForm.setFieldsValue({
      price: agreement.price,
      depositAmount: agreement.depositAmount,
      depositHolder: agreement.depositHolder,
      notaryName: agreement.notaryName ?? undefined,
      expectedDeedDate: agreement.expectedDeedDate ? dayjs(agreement.expectedDeedDate) : null
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreement]);

  const enregistrerModifications = async (values: EditFormValues) => {
    if (!tenantId || !id) return;
    setSaving(true);
    try {
      await updateSaleAgreement(tenantId, id, {
        price: values.price ?? null,
        depositAmount: values.depositAmount ?? null,
        depositHolder: values.depositHolder ?? null,
        notaryName: values.notaryName?.trim() || null,
        expectedDeedDate: values.expectedDeedDate ? values.expectedDeedDate.format('YYYY-MM-DD') : null
      });
      message.success(t('Compromis mis à jour.'));
      refetch();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La mise à jour a échoué.'));
    } finally {
      setSaving(false);
    }
  };

  // --- Signature -------------------------------------------------------------
  const [signOpen, setSignOpen] = useState(false);
  const [signedAt, setSignedAt] = useState<dayjs.Dayjs>(() => dayjs());
  const [signing, setSigning] = useState(false);

  const signer = async () => {
    if (!tenantId || !id) return;
    setSigning(true);
    try {
      const dto = await signSaleAgreement(tenantId, id, signedAt.format('YYYY-MM-DD'));
      message.success(t('Compromis signé.'));
      setSignOpen(false);
      await rafraichirApresMutation(dto);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La signature a échoué.'));
    } finally {
      setSigning(false);
    }
  };

  // --- Passage à l'acte --------------------------------------------------------
  const [completeOpen, setCompleteOpen] = useState(false);
  const [deedDate, setDeedDate] = useState<dayjs.Dayjs>(() => dayjs());
  const [completing, setCompleting] = useState(false);

  const passerActe = async () => {
    if (!tenantId || !id) return;
    setCompleting(true);
    try {
      const dto = await completeSaleAgreement(tenantId, id, deedDate.format('YYYY-MM-DD'));
      message.success(t('Vente conclue : acte signé.'));
      setCompleteOpen(false);
      await rafraichirApresMutation(dto);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Le passage à l’acte a échoué.'));
    } finally {
      setCompleting(false);
    }
  };

  // --- Annulation --------------------------------------------------------------
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const annuler = async () => {
    if (!tenantId || !id || cancelReason.trim().length < 3) {
      message.error(t('Indiquez un motif d’au moins 3 caractères.'));
      return;
    }
    setCancelling(true);
    try {
      await cancelSaleAgreement(tenantId, id, cancelReason.trim());
      message.success(t('Compromis annulé.'));
      setCancelOpen(false);
      setCancelReason('');
      refetch();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('L’annulation a échoué.'));
    } finally {
      setCancelling(false);
    }
  };

  // --- Conditions suspensives ----------------------------------------------
  const [conditionForm] = Form.useForm<{ label: string; dueDate?: dayjs.Dayjs | null }>();
  const [conditionModalOpen, setConditionModalOpen] = useState(false);
  const [savingCondition, setSavingCondition] = useState(false);

  const ajouterCondition = async (values: { label: string; dueDate?: dayjs.Dayjs | null }) => {
    if (!tenantId || !id) return;
    setSavingCondition(true);
    try {
      await addSaleCondition(tenantId, id, {
        label: values.label.trim(),
        dueDate: values.dueDate ? values.dueDate.format('YYYY-MM-DD') : null
      });
      message.success(t('Condition ajoutée.'));
      setConditionModalOpen(false);
      conditionForm.resetFields();
      refetch();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'ajout de la condition a échoué."));
    } finally {
      setSavingCondition(false);
    }
  };

  const changerStatutCondition = async (condition: SaleConditionDto, status: SaleConditionStatus) => {
    if (!tenantId) return;
    try {
      await updateSaleCondition(tenantId, condition.id, { status });
      message.success(t('Condition mise à jour.'));
      refetch();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La mise à jour de la condition a échoué.'));
    }
  };

  const supprimerCondition = async (condition: SaleConditionDto) => {
    if (!tenantId) return;
    try {
      await deleteSaleCondition(tenantId, condition.id);
      message.success(t('Condition supprimée.'));
      refetch();
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('La suppression a échoué.'));
    }
  };

  // --- Échéancier de l'acquéreur ----------------------------------------------
  const [milestoneRows, setMilestoneRows] = useState<MilestoneRow[]>([]);
  const [savingMilestones, setSavingMilestones] = useState(false);

  useEffect(() => {
    if (agreement) setMilestoneRows(agreement.milestones);
  }, [agreement]);

  const ajouterEcheance = () => {
    setMilestoneRows(rows => [
      ...rows,
      {
        id: `new-${Date.now()}`,
        label: '',
        dueDate: null,
        amount: 0,
        paidAt: null,
        sortOrder: rows.length,
        isNew: true
      }
    ]);
  };

  const modifierEcheance = (index: number, patch: Partial<MilestoneRow>) => {
    setMilestoneRows(rows => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const retirerEcheance = (index: number) => {
    setMilestoneRows(rows => rows.filter((_, i) => i !== index));
  };

  const totalEcheancier = milestoneRows.reduce((somme, row) => somme + (row.amount || 0), 0);
  const depassePrix = Boolean(agreement && totalEcheancier > agreement.price);

  const enregistrerEcheancier = async () => {
    if (!tenantId || !id) return;
    setSavingMilestones(true);
    try {
      const milestones = await replaceSaleMilestones(
        tenantId,
        id,
        milestoneRows.map(row => ({
          label: row.label,
          dueDate: row.dueDate,
          amount: row.amount,
          paidAt: row.paidAt
        }))
      );
      message.success(t('Échéancier enregistré.'));
      setMilestoneRows(milestones);
    } catch (err: any) {
      message.error(err?.response?.data?.message || t("L'enregistrement de l'échéancier a échoué."));
    } finally {
      setSavingMilestones(false);
    }
  };

  if (!tenantId || !id) {
    return <StateBlock variant="empty" title={t('Aucun compromis sélectionné')} />;
  }

  const filAriane = [{ label: t('Ventes'), to: `/tenant/${tenantId}/sales` }];

  if (erreurRequete) {
    return (
      <>
        <PageHeader title={t('Compromis de vente')} breadcrumbs={filAriane} />
        <StateBlock
          variant="error"
          description={t('Impossible de charger ce compromis.')}
          actions={[{ label: t('Réessayer'), onClick: () => refetch(), primary: true }]}
        />
      </>
    );
  }

  if (isPending || !agreement) {
    return <StateBlock variant="loading" />;
  }

  const enEdition = agreement.status === 'DRAFT' || agreement.status === 'SIGNED';
  const peutModifier = enEdition;
  const peutSigner = agreement.status === 'DRAFT';
  const peutPasserActe = agreement.status === 'SIGNED';
  const conditionsEnAttente = agreement.pendingConditionsCount > 0;
  const peutAnnuler = enEdition;

  const colonnesConditions: ColumnsType<SaleConditionDto> = [
    { title: t('Condition'), key: 'label', render: (_, c) => c.label },
    { title: t('Échéance'), key: 'echeance', render: (_, c) => dateCourte(c.dueDate) },
    {
      title: t('Statut'),
      key: 'statut',
      render: (_, c) =>
        peutModifier ? (
          <Select
            size="small"
            style={{ width: 160 }}
            value={c.status}
            onChange={value => changerStatutCondition(c, value)}
            options={CONDITION_STATUS_OPTIONS}
          />
        ) : (
          <SaleStatusTag kind="condition" status={c.status} />
        )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, c) =>
        agreement.status === 'DRAFT' ? (
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => supprimerCondition(c)}>
            {t('Supprimer')}
          </Button>
        ) : null
    }
  ];

  return (
    <>
      <PageHeader
        title={agreement.number}
        subtitle={`${agreement.propertyLabel} · ${agreement.buyerName}`}
        breadcrumbs={[...filAriane, { label: agreement.number }]}
        secondaryActions={
          peutAnnuler
            ? [{ key: 'cancel', label: t('Annuler le compromis'), danger: true, onClick: () => setCancelOpen(true) }]
            : undefined
        }
      />

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        {agreement.status === 'CANCELLED' ? (
          <Alert
            type="error"
            showIcon
            message={t('Compromis annulé')}
            description={
              agreement.cancelReason ? `${dateCourte(agreement.cancelledAt)} — ${agreement.cancelReason}` : undefined
            }
            style={{ marginBottom: 'var(--space-4)' }}
          />
        ) : (
          <Steps
            current={STEP_INDEX[agreement.status] ?? 0}
            items={[
              { title: t('Brouillon') },
              { title: t('Signé'), subTitle: dateCourte(agreement.signedAt) },
              { title: t('Acte'), subTitle: dateCourte(agreement.deedDate) }
            ]}
            style={{ marginBottom: 'var(--space-6)' }}
          />
        )}

        <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
          <Descriptions.Item label={t('Mandat')}>
            <Link to={`/tenant/${tenantId}/sales/mandates/${agreement.mandateId}`}>{agreement.mandateNumber}</Link>
          </Descriptions.Item>
          <Descriptions.Item label={t('Bien')}>{agreement.propertyLabel}</Descriptions.Item>
          <Descriptions.Item label={t('Vendeur')}>{agreement.sellerName}</Descriptions.Item>
          <Descriptions.Item label={t('Acquéreur')}>{agreement.buyerName}</Descriptions.Item>
        </Descriptions>

        <Title level={5} style={{ marginTop: 'var(--space-5)' }}>
          {t('Prix, dépôt et notaire')}
        </Title>
        <Form<EditFormValues>
          form={editForm}
          layout="vertical"
          onFinish={enregistrerModifications}
          onFinishFailed={onAntFormValidationFailed(editForm)}
          disabled={!peutModifier}
        >
          <Space wrap size="large" align="start">
            <Form.Item label={t('Prix convenu')} name="price">
              <InputNumber style={{ width: 220 }} min={1} {...montantSaisiProps} />
            </Form.Item>
            <Form.Item label={t('Dépôt de l’acquéreur')} name="depositAmount">
              <InputNumber style={{ width: 220 }} min={0} {...montantSaisiProps} />
            </Form.Item>
            <Form.Item label={t('Dépôt détenu par')} name="depositHolder">
              <Radio.Group>
                <Radio value="NOTARY">{DEPOSIT_HOLDER_LABELS.NOTARY}</Radio>
                <Radio value="SELLER">{DEPOSIT_HOLDER_LABELS.SELLER}</Radio>
              </Radio.Group>
            </Form.Item>
          </Space>
          <Space wrap size="large" align="start">
            <Form.Item label={t('Notaire')} name="notaryName">
              <Input style={{ width: 260 }} />
            </Form.Item>
            <Form.Item label={t('Date prévue de l’acte')} name="expectedDeedDate">
              <DatePicker style={{ width: 220 }} format="DD/MM/YYYY" />
            </Form.Item>
          </Space>
          {peutModifier && (
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => editForm.submit()}>
              {t('Enregistrer')}
            </Button>
          )}
        </Form>

        <Space wrap style={{ marginTop: 'var(--space-6)' }}>
          {peutSigner && (
            <Button type="primary" onClick={() => setSignOpen(true)}>
              {t('Signer le compromis')}
            </Button>
          )}
          {peutPasserActe && (
            <Tooltip
              title={
                conditionsEnAttente
                  ? t('Toutes les conditions suspensives doivent être remplies ou levées.')
                  : undefined
              }
            >
              <span>
                <Button type="primary" disabled={conditionsEnAttente} onClick={() => setCompleteOpen(true)}>
                  {t('Passer à l’acte')}
                </Button>
              </span>
            </Tooltip>
          )}
        </Space>
      </Card>

      <Card
        title={t('Conditions suspensives')}
        style={{ marginBottom: 'var(--space-6)' }}
        extra={
          agreement.status === 'DRAFT' && (
            <Button icon={<PlusOutlined />} size="small" onClick={() => setConditionModalOpen(true)}>
              {t('Ajouter')}
            </Button>
          )
        }
      >
        <Table<SaleConditionDto>
          size="small"
          dataSource={agreement.conditions}
          columns={colonnesConditions}
          rowKey={c => c.id}
          pagination={false}
          locale={{ emptyText: t('Aucune condition suspensive.') }}
        />
      </Card>

      <Card title={t('Échéancier de l’acquéreur')} style={{ marginBottom: 'var(--space-6)' }}>
        {depassePrix && (
          <Alert
            type="warning"
            showIcon
            message={t('La somme de l’échéancier dépasse le prix convenu.')}
            style={{ marginBottom: 'var(--space-4)' }}
          />
        )}
        <Table<MilestoneRow>
          size="small"
          dataSource={milestoneRows}
          rowKey={r => r.id}
          pagination={false}
          locale={{ emptyText: t('Aucune échéance saisie.') }}
          columns={[
            {
              title: t('Libellé'),
              key: 'label',
              render: (_, row, index) => (
                <Input value={row.label} onChange={e => modifierEcheance(index, { label: e.target.value })} />
              )
            },
            {
              title: t('Échéance'),
              key: 'dueDate',
              render: (_, row, index) => (
                <DatePicker
                  format="DD/MM/YYYY"
                  value={row.dueDate ? dayjs(row.dueDate) : null}
                  onChange={value => modifierEcheance(index, { dueDate: value ? value.format('YYYY-MM-DD') : null })}
                />
              )
            },
            {
              title: t('Montant'),
              key: 'amount',
              render: (_, row, index) => (
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  {...montantSaisiProps}
                  value={row.amount}
                  onChange={value => modifierEcheance(index, { amount: (value as number) ?? 0 })}
                />
              )
            },
            {
              title: t('Payée le'),
              key: 'paidAt',
              render: (_, row, index) => (
                <DatePicker
                  format="DD/MM/YYYY"
                  value={row.paidAt ? dayjs(row.paidAt) : null}
                  onChange={value => modifierEcheance(index, { paidAt: value ? value.format('YYYY-MM-DD') : null })}
                />
              )
            },
            {
              title: '',
              key: 'actions',
              render: (_, __, index) => (
                <Button danger size="small" icon={<DeleteOutlined />} onClick={() => retirerEcheance(index)} />
              )
            }
          ]}
        />
        <Space style={{ marginTop: 'var(--space-3)' }}>
          <Button icon={<PlusOutlined />} onClick={ajouterEcheance}>
            {t('Ajouter une échéance')}
          </Button>
          <Button type="primary" loading={savingMilestones} onClick={enregistrerEcheancier}>
            {t('Enregistrer l’échéancier')}
          </Button>
          <Text type="secondary">
            {t('Total')} : <MoneyValue value={totalEcheancier} />
          </Text>
        </Space>
      </Card>

      <Card title={t('Commission')}>
        {agreement.commission ? (
          <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
            <Descriptions.Item label={t('Numéro')}>{agreement.commission.number}</Descriptions.Item>
            <Descriptions.Item label={t('Statut')}>
              <SaleStatusTag kind="commission" status={agreement.commission.status} />
            </Descriptions.Item>
            <Descriptions.Item label={t('Montant HT')}>
              <MoneyValue value={agreement.commission.amountExclTax} />
            </Descriptions.Item>
            <Descriptions.Item label={t('TVA')}>
              <MoneyValue value={agreement.commission.vatAmount} />
            </Descriptions.Item>
            <Descriptions.Item label={t('Montant TTC')}>
              <MoneyValue value={agreement.commission.amountInclTax} />
            </Descriptions.Item>
            <Descriptions.Item label={t('Reste dû')}>
              <MoneyValue value={agreement.commission.remainingAmount} />
            </Descriptions.Item>
            <Descriptions.Item label={t('Négociateur')}>{agreement.commission.agentName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label={t('Part du négociateur')}>
              <MoneyValue value={agreement.commission.agentShareEarned} />
            </Descriptions.Item>
            <Descriptions.Item label="" span={2}>
              <Link to={`/tenant/${tenantId}/sales/commissions`}>{t('Voir les commissions de vente')}</Link>
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Text type="secondary">{t('La commission sera créée à la signature de l’acte authentique.')}</Text>
        )}
      </Card>

      {/* Signature */}
      <Modal
        title={t('Signer le compromis')}
        open={signOpen}
        onCancel={() => setSignOpen(false)}
        onOk={signer}
        confirmLoading={signing}
        okText={t('Signer')}
        cancelText={t('Annuler')}
      >
        <Text>{t('Date de signature')}</Text>
        <DatePicker
          style={{ width: '100%', marginTop: 'var(--space-2)' }}
          format="DD/MM/YYYY"
          value={signedAt}
          onChange={value => value && setSignedAt(value)}
        />
      </Modal>

      {/* Passage à l'acte */}
      <Modal
        title={t('Passer à l’acte')}
        open={completeOpen}
        onCancel={() => setCompleteOpen(false)}
        onOk={passerActe}
        confirmLoading={completing}
        okText={t('Confirmer')}
        cancelText={t('Annuler')}
      >
        <Text>{t('Date de l’acte authentique')}</Text>
        <DatePicker
          style={{ width: '100%', marginTop: 'var(--space-2)' }}
          format="DD/MM/YYYY"
          value={deedDate}
          onChange={value => value && setDeedDate(value)}
        />
      </Modal>

      {/* Annulation */}
      <Modal
        title={t('Annuler le compromis')}
        open={cancelOpen}
        onCancel={() => setCancelOpen(false)}
        onOk={annuler}
        confirmLoading={cancelling}
        okText={t('Annuler le compromis')}
        okButtonProps={{ danger: true }}
        cancelText={t('Fermer')}
      >
        <Text>{t('Motif d’annulation')}</Text>
        <TextArea
          rows={3}
          style={{ marginTop: 'var(--space-2)' }}
          value={cancelReason}
          onChange={e => setCancelReason(e.target.value)}
        />
      </Modal>

      {/* Nouvelle condition suspensive */}
      <Modal
        title={t('Ajouter une condition suspensive')}
        open={conditionModalOpen}
        onCancel={() => setConditionModalOpen(false)}
        onOk={() => conditionForm.submit()}
        confirmLoading={savingCondition}
        okText={t('Ajouter')}
        cancelText={t('Annuler')}
        destroyOnClose
      >
        <Form
          form={conditionForm}
          layout="vertical"
          onFinish={ajouterCondition}
          onFinishFailed={onAntFormValidationFailed(conditionForm)}
        >
          <Form.Item
            label={t('Libellé')}
            name="label"
            rules={[{ required: true, message: t('Le libellé est requis') }]}
          >
            <Input placeholder={t('Ex. Obtention du prêt bancaire')} />
          </Form.Item>
          <Form.Item label={t('Échéance')} name="dueDate">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default SaleAgreementDetail;
