import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Space,
  Spin,
  Table,
  Typography
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  addSubscriptionItem,
  changeSubscriptionPack,
  clearSubscriptionManualReadOnly,
  getSubscriptionOverview,
  grantCapacityOverride,
  listCatalog,
  previewNextInvoice,
  removeSubscriptionItem,
  revokeCapacityOverride,
  setSubscriptionManualReadOnly,
  updateSubscriptionSettings,
  type CapacityKeyCode,
  type CapacityOverrideDTO,
  type CatalogEntry,
  type InvoicePreview,
  type ModuleAccess,
  type QuotaPolicyCode,
  type SubscriptionItemDTO,
  type SubscriptionOverview
} from '../../../services/subscription-v2-service';
import {
  handleExtensionRequest,
  listExtensionRequests,
  updateSubscriptionItem,
  type ExtensionRequest
} from '../../../services/subscription-extras-service';
import { StatusTag, MoneyValue, useConfirmAction } from '../../primitives';
import { ReasonPromptModal } from '../ReasonPromptModal';
import { isExtensionAllowed } from '../../../utils/extension-rules';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';

const { Text, Title } = Typography;

const REQUEST_STATUS_LABEL: Record<
  string,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }
> = {
  OPEN: { label: t('Ouverte'), tone: 'warning' },
  HANDLED: { label: t('Traitée'), tone: 'success' },
  DECLINED: { label: t('Refusée'), tone: 'neutral' }
};

/**
 * Onglet Abonnement de la fiche agence (vague 2, lot C) — abonnements par
 * packs (docs/architecture/PLAN-ABONNEMENTS.md). Remplace l'ancien écran
 * BASIC/PRO/ELITE (`planKey`, déprécié) : l'abonnement est la somme de ses
 * `SubscriptionItem`. Absorbe l'ancien onglet « Modules » (§2 du plan) :
 * les modules ouverts sont affichés ici, en lecture seule, déduits des packs.
 */

const CAPACITY_LABEL: Record<CapacityKeyCode, string> = {
  LOTS: t('Lots'),
  COPROPRIETES: t('Copropriétés'),
  CHANTIERS: t('Chantiers'),
  BIENS_DETENUS: t('Biens détenus')
};

/**
 * Pack Patrimoine, lot P1 : Essentiel et Pro ne se cumulent pas
 * (`rules.tierGroup`, catalog.ts) — passer de l'un à l'autre est un
 * changement de pack (`changeSubscriptionPack`), pas un ajout/retrait.
 */
const PATRIMOINE_TIER_TARGET: Record<
  'PATRIMOINE_ESSENTIEL' | 'PATRIMOINE_PRO',
  'PATRIMOINE_ESSENTIEL' | 'PATRIMOINE_PRO'
> = {
  PATRIMOINE_ESSENTIEL: 'PATRIMOINE_PRO',
  PATRIMOINE_PRO: 'PATRIMOINE_ESSENTIEL'
};

// Fonction et non constante : un `t()` évalué à l'import resterait figé dans la langue
// active à ce moment-là (« Essai » restait en français après passage à l'anglais).
const phaseLabels = (): Record<
  string,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }
> => ({
  NONE: { label: t('Aucun abonnement'), tone: 'neutral' },
  TRIAL: { label: t('Essai'), tone: 'info' },
  ACTIVE: { label: t('Actif'), tone: 'success' },
  GRACE: { label: t('Grâce'), tone: 'warning' },
  READ_ONLY: { label: t('Lecture seule'), tone: 'danger' }
});

const QUOTA_POLICY_OPTIONS: Array<{ value: QuotaPolicyCode; label: string }> = [
  { value: 'BLOCK', label: t('Bloquer le dépassement') },
  { value: 'BILL_OVERAGE', label: t('Facturer le dépassement') },
  { value: 'WARN_ONLY', label: t('Avertir seulement') }
];

/**
 * Écart de recette Syndic D.4 : en `warn` (valeur par défaut de
 * `SUBSCRIPTION_ENFORCEMENT`), `evaluateQuota` ne bloque jamais un
 * dépassement, quelle que soit la « Politique de dépassement » choisie ici —
 * y compris « Bloquer le dépassement ». Le super-admin doit le savoir avant
 * de croire la politique active.
 */
const ENFORCEMENT_NOTICE: Partial<Record<'off' | 'warn', string>> = {
  off: t(
    'Mode « désactivé » : tous les modules restent accessibles, quels que soient les packs souscrits, et aucun dépassement n’est bloqué, quelle que soit la politique choisie. Les vérifications ne s’appliquent qu’en mode « appliquer » (SUBSCRIPTION_ENFORCEMENT=enforce).'
  ),
  warn: t(
    'Mode « avertir » : les modules non souscrits restent accessibles et aucun dépassement n’est bloqué, quelle que soit la politique choisie. La politique ne s’applique qu’en mode « appliquer » (SUBSCRIPTION_ENFORCEMENT=enforce).'
  )
};

const MODULE_LABEL: Record<string, string> = {
  MODULE_AGENCY: t('Agence'),
  MODULE_SYNDIC: t('Syndic'),
  MODULE_PROMOTER: t('Promoteur'),
  MODULE_PATRIMOINE: t('Patrimoine')
};

const MODULE_ACCESS_LABEL: Record<ModuleAccess, { label: string; tone: 'neutral' | 'success' | 'warning' }> = {
  FULL: { label: t('Ouvert'), tone: 'success' },
  READ_ONLY: { label: t('Lecture seule'), tone: 'warning' },
  NONE: { label: t('Fermé'), tone: 'neutral' }
};

const ITEM_KIND_LABEL: Record<string, string> = {
  PACK: t('Pack'),
  EXTENSION: t('Extension'),
  SETUP: t('Mise en route')
};

const ITEM_STATUS_LABEL: Record<string, { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  ACTIVE: { label: t('Actif'), tone: 'success' },
  SCHEDULED: { label: t('Programmé'), tone: 'info' },
  ENDED: { label: t('Terminé'), tone: 'neutral' }
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(activeLocale(), { year: 'numeric', month: 'long', day: 'numeric' });
}

function capacityTone(percent: number): 'success' | 'exception' | 'normal' {
  if (percent >= 100) return 'exception';
  if (percent >= 80) return 'exception';
  return 'normal';
}

function capacityStrokeColor(percent: number): string {
  if (percent >= 100) return 'var(--color-error-text)';
  if (percent >= 80) return 'var(--color-warning-text)';
  return 'var(--color-success-text)';
}

interface AddItemModalProps {
  open: boolean;
  onClose: () => void;
  catalog: CatalogEntry[];
  heldPacks: string[];
  onSubmit: (input: { code: string; quantity: number; discountPercent?: number }) => Promise<void>;
}

const AddItemModal: React.FC<AddItemModalProps> = ({ open, onClose, catalog, heldPacks, onSubmit }) => {
  const [form] = Form.useForm<{ code: string; quantity: number; discountPercent?: number }>();
  const [saving, setSaving] = useState(false);

  // Packs Patrimoine (lot P1) : Essentiel et Pro partagent un `tierGroup`
  // (catalog.ts) et ne se cumulent pas — le passage de l'un à l'autre est un
  // changement de pack (bouton dédié dans le tableau), pas un ajout.
  const heldTierGroups = useMemo(
    () => new Set(catalog.filter(c => heldPacks.includes(c.code) && c.rules?.tierGroup).map(c => c.rules!.tierGroup!)),
    [catalog, heldPacks]
  );
  const options = useMemo(
    () =>
      catalog
        .filter(c => c.isSellable)
        .filter(c => (c.kind === 'PACK' ? !heldPacks.includes(c.code) : true))
        .filter(c => !(c.kind === 'PACK' && c.rules?.tierGroup && heldTierGroups.has(c.rules.tierGroup)))
        // Une extension n'est vendable qu'avec l'un des packs de `rules.requiresAnyOf`.
        .filter(c => c.kind === 'PACK' || isExtensionAllowed(c.rules?.requiresAnyOf, heldPacks))
        .map(c => ({ value: c.code, label: `${c.name} (${ITEM_KIND_LABEL[c.kind] ?? c.kind})` })),
    [catalog, heldPacks, heldTierGroups]
  );

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await onSubmit({ code: values.code, quantity: values.quantity ?? 1, discountPercent: values.discountPercent });
      form.resetFields();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('Ajouter un pack ou une extension')}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText={t('Ajouter')}
      cancelText={t('Annuler')}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ quantity: 1 }}>
        <Form.Item label={t('Offre')} name="code" rules={[{ required: true, message: t("L'offre est requise") }]}>
          <Select options={options} showSearch optionFilterProp="label" />
        </Form.Item>
        <Form.Item label={t('Quantité')} name="quantity" rules={[{ required: true }]}>
          <InputNumber min={1} max={1000} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label={t('Remise (%)')} name="discountPercent">
          <InputNumber min={0} max={100} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

interface OverrideModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    capacityKey: CapacityKeyCode;
    delta: number;
    reason: string;
    expiresAt?: string | null;
  }) => Promise<void>;
}

const OverrideModal: React.FC<OverrideModalProps> = ({ open, onClose, onSubmit }) => {
  const [form] = Form.useForm<{ capacityKey: CapacityKeyCode; delta: number; reason: string; expiresAt?: string }>();
  const [saving, setSaving] = useState(false);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await onSubmit({
        capacityKey: values.capacityKey,
        delta: values.delta,
        reason: values.reason,
        expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null
      });
      form.resetFields();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('Accorder une dérogation')}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText={t('Accorder')}
      cancelText={t('Annuler')}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item label={t('Capacité')} name="capacityKey" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'LOTS', label: t('Lots') },
              { value: 'COPROPRIETES', label: t('Copropriétés') },
              { value: 'CHANTIERS', label: t('Chantiers') },
              { value: 'BIENS_DETENUS', label: t('Biens détenus') }
            ]}
          />
        </Form.Item>
        <Form.Item
          label={t('Quantité (négative pour retirer)')}
          name="delta"
          rules={[{ required: true, message: t('La quantité est requise') }]}
        >
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item label={t('Raison')} name="reason" rules={[{ required: true, message: t('La raison est requise') }]}>
          <Input.TextArea rows={2} placeholder={t('Ex. : Reprise, geste commercial…')} />
        </Form.Item>
        <Form.Item label={t('Expire le (facultatif)')} name="expiresAt">
          <Input type="date" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export const SubscriptionTab: React.FC<{ tenantId: string; tenantName?: string }> = ({ tenantId, tenantName }) => {
  const { message, modal } = App.useApp();
  const confirmAction = useConfirmAction();
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [invoicePreview, setInvoicePreview] = useState<InvoicePreview | null>(null);
  const [requests, setRequests] = useState<ExtensionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [manualReadOnlySaving, setManualReadOnlySaving] = useState(false);
  const [manualReadOnlyPromptOpen, setManualReadOnlyPromptOpen] = useState(false);
  const [removeNowItem, setRemoveNowItem] = useState<SubscriptionItemDTO | null>(null);
  const [removeNowSaving, setRemoveNowSaving] = useState(false);
  const [discountItem, setDiscountItem] = useState<SubscriptionItemDTO | null>(null);
  const [discountValues, setDiscountValues] = useState<{ discountPercent: number; unitMonthlyPrice: number }>({
    discountPercent: 0,
    unitMonthlyPrice: 0
  });
  const [discountSaving, setDiscountSaving] = useState(false);
  const [tierChangeSaving, setTierChangeSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, catalogData, preview, requestData] = await Promise.all([
        getSubscriptionOverview(tenantId),
        listCatalog(true).catch(() => []),
        previewNextInvoice(tenantId).catch(() => null),
        listExtensionRequests(tenantId).catch(() => [] as ExtensionRequest[])
      ]);
      setOverview(overviewData);
      setCatalog(catalogData);
      setInvoicePreview(preview);
      setRequests(requestData);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setOverview(null);
      } else {
        setError(err.response?.data?.message || t("Erreur lors du chargement de l'abonnement"));
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddItem = async (input: { code: string; quantity: number; discountPercent?: number }) => {
    try {
      await addSubscriptionItem(tenantId, input);
      message.success(t('Élément ajouté'));
      await load();
    } catch (err: any) {
      message.error(err.response?.data?.message || t("Erreur lors de l'ajout"));
      throw err;
    }
  };

  const handleRemoveAtEnd = (item: SubscriptionItemDTO) => {
    confirmAction({
      title: t('Retirer « {{value}} » à l’échéance ?', { value: item.name }),
      description: t('L’élément reste actif jusqu’à la fin de la période en cours, sans remboursement.'),
      okText: t('Retirer à l’échéance'),
      onConfirm: async () => {
        try {
          await removeSubscriptionItem(tenantId, item.id, {});
          message.success(t('Retrait programmé à l’échéance'));
          await load();
        } catch (err: any) {
          message.error(err.response?.data?.message || t('Erreur lors du retrait'));
        }
      }
    });
  };

  const handleRemoveNow = (item: SubscriptionItemDTO) => {
    setRemoveNowItem(item);
  };

  const confirmRemoveNow = async (reason: string) => {
    if (!removeNowItem) return;
    setRemoveNowSaving(true);
    try {
      await removeSubscriptionItem(tenantId, removeNowItem.id, { immediate: true, reason });
      message.success(t('Élément retiré immédiatement'));
      setRemoveNowItem(null);
      await load();
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors du retrait'));
    } finally {
      setRemoveNowSaving(false);
    }
  };

  /** Remise ou prix figé d'un élément : une seule écriture auditée (`PATCH …/items/:itemId`). */
  const handleEditDiscount = (item: SubscriptionItemDTO) => {
    setDiscountValues({ discountPercent: item.discountPercent, unitMonthlyPrice: item.unitMonthlyPrice });
    setDiscountItem(item);
  };

  const confirmEditDiscount = async (reason: string) => {
    if (!discountItem) return;
    setDiscountSaving(true);
    try {
      await updateSubscriptionItem(tenantId, discountItem.id, {
        discountPercent: discountValues.discountPercent,
        ...(discountValues.unitMonthlyPrice !== discountItem.unitMonthlyPrice
          ? { unitMonthlyPrice: discountValues.unitMonthlyPrice }
          : {}),
        ...(reason ? { reason } : {})
      });
      message.success(t('Élément mis à jour'));
      setDiscountItem(null);
      await load();
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors de la mise à jour'));
    } finally {
      setDiscountSaving(false);
    }
  };

  /**
   * Changement de palier Patrimoine (Essentiel ↔ Pro, lot P1) : les deux
   * packs partagent un `tierGroup` (catalog.ts) et ne se cumulent pas — c'est
   * un `changeSubscriptionPack`, pas un ajout puis un retrait séparés.
   */
  const handleChangeTier = (item: SubscriptionItemDTO) => {
    const target = PATRIMOINE_TIER_TARGET[item.code as 'PATRIMOINE_ESSENTIEL' | 'PATRIMOINE_PRO'];
    const targetName = catalog.find(c => c.code === target)?.name ?? target;
    confirmAction({
      title: t('Passer de « {{from}} » à « {{to}} » ?', { from: item.name, to: targetName }),
      description: t('Prend effet immédiatement, au prorata de la période en cours.'),
      okText: t('Changer de pack'),
      onConfirm: async () => {
        setTierChangeSaving(true);
        try {
          await changeSubscriptionPack(tenantId, { fromCodes: [item.code], toCode: target });
          message.success(t('Pack changé'));
          await load();
        } catch (err: any) {
          message.error(err.response?.data?.message || t('Erreur lors du changement de pack'));
        } finally {
          setTierChangeSaving(false);
        }
      }
    });
  };

  const handleCloseRequest = async (request: ExtensionRequest, status: 'HANDLED' | 'DECLINED') => {
    try {
      await handleExtensionRequest(tenantId, request.id, { status });
      message.success(status === 'HANDLED' ? t('Demande marquée traitée') : t('Demande refusée'));
      await load();
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors de la mise à jour'));
    }
  };

  const handleGrantOverride = async (input: {
    capacityKey: CapacityKeyCode;
    delta: number;
    reason: string;
    expiresAt?: string | null;
  }) => {
    try {
      await grantCapacityOverride(tenantId, input);
      message.success(t('Dérogation accordée'));
      await load();
    } catch (err: any) {
      message.error(err.response?.data?.message || t("Erreur lors de l'octroi de la dérogation"));
      throw err;
    }
  };

  const handleRevokeOverride = (override: CapacityOverrideDTO) => {
    confirmAction({
      title: t('Révoquer cette dérogation ?'),
      description: override.reason,
      okText: t('Révoquer'),
      danger: true,
      onConfirm: async () => {
        try {
          await revokeCapacityOverride(tenantId, override.id);
          message.success(t('Dérogation révoquée'));
          await load();
        } catch (err: any) {
          message.error(err.response?.data?.message || t('Erreur lors de la révocation'));
        }
      }
    });
  };

  const handleQuotaPolicyChange = async (quotaPolicy: QuotaPolicyCode) => {
    setSettingsSaving(true);
    try {
      await updateSubscriptionSettings(tenantId, { quotaPolicy });
      message.success(t('Politique de dépassement mise à jour'));
      await load();
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors de la mise à jour'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleExtendTrial = () => {
    if (!overview) return;
    let days = 15;
    modal.confirm({
      title: t("Prolonger l'essai"),
      content: (
        <InputNumber
          min={1}
          max={365}
          defaultValue={15}
          addonAfter={t('jours')}
          style={{ width: '100%' }}
          onChange={value => {
            days = Number(value) || 15;
          }}
        />
      ),
      okText: t('Prolonger'),
      cancelText: t('Annuler'),
      onOk: async () => {
        const base = overview.subscription.trialEndsAt ? new Date(overview.subscription.trialEndsAt) : new Date();
        const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
        try {
          await updateSubscriptionSettings(tenantId, { trialEndsAt: next.toISOString() });
          message.success(t('Essai prolongé'));
          await load();
        } catch (err: any) {
          message.error(err.response?.data?.message || t("Erreur lors de la prolongation de l'essai"));
          throw err;
        }
      }
    });
  };

  /**
   * Lecture seule manuelle (Baba, 25/09) : action super-admin, motif
   * obligatoire, independante de la lecture seule d'impaye — jamais levee par
   * un paiement ni par la tâche planifiée, seulement par cette action.
   */
  const handleSetManualReadOnly = () => {
    setManualReadOnlyPromptOpen(true);
  };

  const confirmSetManualReadOnly = async (reason: string) => {
    setManualReadOnlySaving(true);
    try {
      await setSubscriptionManualReadOnly(tenantId, reason);
      message.success(t('Agence passée en lecture seule'));
      setManualReadOnlyPromptOpen(false);
      await load();
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors du passage en lecture seule'));
    } finally {
      setManualReadOnlySaving(false);
    }
  };

  const handleClearManualReadOnly = () => {
    confirmAction({
      title: t('Lever la lecture seule manuelle ?'),
      description: overview?.entitlements.manualReadOnlyReason ?? undefined,
      okText: t('Lever la lecture seule'),
      onConfirm: async () => {
        setManualReadOnlySaving(true);
        try {
          await clearSubscriptionManualReadOnly(tenantId);
          message.success(t('Lecture seule manuelle levée'));
          await load();
        } catch (err: any) {
          message.error(err.response?.data?.message || t('Erreur lors de la levée de la lecture seule'));
        } finally {
          setManualReadOnlySaving(false);
        }
      }
    });
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
        <Spin />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" showIcon message={error} action={<Button onClick={load}>{t('Réessayer')}</Button>} />;
  }

  if (!overview) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
        <p>{t('Cette agence n’a pas encore d’abonnement.')}</p>
      </div>
    );
  }

  const { subscription, items, overrides, entitlements } = overview;
  const heldPacks = entitlements.packs;
  const phaseInfo = phaseLabels()[entitlements.phase] ?? phaseLabels().NONE;

  const itemColumns: ColumnsType<SubscriptionItemDTO> = [
    {
      title: t('Élément'),
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Text strong>{item.name}</Text>
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            {ITEM_KIND_LABEL[item.kind] ?? item.kind}
          </Text>
        </Space>
      )
    },
    { title: t('Quantité'), dataIndex: 'quantity', key: 'quantity' },
    {
      title: t('Prix mensuel figé'),
      key: 'price',
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <MoneyValue value={item.quantity * item.unitMonthlyPrice * (1 - item.discountPercent / 100)} />
          {item.discountPercent > 0 && (
            <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
              {t('Remise {{value}} %', { value: item.discountPercent })}
            </Text>
          )}
        </Space>
      )
    },
    {
      title: t('Début / fin'),
      key: 'period',
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 'var(--font-size-sm)' }}>{formatDateTime(item.startsAt)}</Text>
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            {item.endsAt ? formatDateTime(item.endsAt) : t('sans fin')}
          </Text>
        </Space>
      )
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const info = ITEM_STATUS_LABEL[status];
        return <StatusTag status={status} tone={info?.tone} label={info?.label} />;
      }
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_, item) =>
        item.status === 'ENDED' ? (
          <Text type="secondary">—</Text>
        ) : (
          <Space wrap>
            <Button size="small" onClick={() => handleEditDiscount(item)}>
              {t('Modifier')}
            </Button>
            {(item.code === 'PATRIMOINE_ESSENTIEL' || item.code === 'PATRIMOINE_PRO') && (
              <Button size="small" loading={tierChangeSaving} onClick={() => handleChangeTier(item)}>
                {item.code === 'PATRIMOINE_ESSENTIEL' ? t('Passer au Pro') : t("Passer à l'Essentiel")}
              </Button>
            )}
            {!item.endsAt && (
              <Button size="small" onClick={() => handleRemoveAtEnd(item)}>
                {t('Retirer à l’échéance')}
              </Button>
            )}
            <Button size="small" danger onClick={() => handleRemoveNow(item)}>
              {t('Retirer immédiatement')}
            </Button>
          </Space>
        )
    }
  ];

  const overrideColumns: ColumnsType<CapacityOverrideDTO> = [
    {
      title: t('Capacité'),
      dataIndex: 'capacityKey',
      key: 'capacityKey',
      render: (v: CapacityKeyCode) => CAPACITY_LABEL[v] ?? v
    },
    { title: t('Quantité'), dataIndex: 'delta', key: 'delta' },
    { title: t('Raison'), dataIndex: 'reason', key: 'reason' },
    {
      title: t('Expire le'),
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (v: string | null) => (v ? formatDateTime(v) : t('sans limite'))
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_, o) =>
        o.revokedAt ? (
          <StatusTag status="REVOKED" />
        ) : o.expiresAt && new Date(o.expiresAt).getTime() < Date.now() ? (
          <StatusTag status="EXPIRED" />
        ) : (
          <StatusTag status="ACTIVE" />
        )
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_, o) =>
        !o.revokedAt && (
          <Button size="small" danger onClick={() => handleRevokeOverride(o)}>
            {t('Révoquer')}
          </Button>
        )
    }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title={t('Abonnement')}>
        <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
          <Descriptions.Item label={t('Statut')}>
            <StatusTag status={subscription.status} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Phase')}>
            <StatusTag status={entitlements.phase} tone={phaseInfo.tone} label={phaseInfo.label} />
          </Descriptions.Item>
          <Descriptions.Item label={t('Cycle de facturation')}>
            {subscription.billingCycle === 'ANNUAL' ? t('Annuel (11 mois facturés)') : t('Mensuel')}
          </Descriptions.Item>
          <Descriptions.Item label={t('Période en cours')}>
            {formatDateTime(subscription.currentPeriodStart)} — {formatDateTime(subscription.currentPeriodEnd)}
          </Descriptions.Item>
          <Descriptions.Item label={t("Fin d'essai")}>
            <Space>
              {subscription.trialEndsAt ? formatDateTime(subscription.trialEndsAt) : t('hors essai')}
              {subscription.status === 'TRIALING' && (
                <Button size="small" type="link" onClick={handleExtendTrial}>
                  {t('Prolonger')}
                </Button>
              )}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={t('Jours de grâce')}>{subscription.graceDays}</Descriptions.Item>
          <Descriptions.Item label={t('Remise de combinaison')}>
            {subscription.comboDiscountPercent} %
          </Descriptions.Item>
          <Descriptions.Item label={t('Politique de dépassement')}>
            <Select
              size="small"
              value={subscription.quotaPolicy}
              options={QUOTA_POLICY_OPTIONS}
              style={{ minWidth: 220 }}
              loading={settingsSaving}
              disabled={settingsSaving}
              onChange={handleQuotaPolicyChange}
            />
          </Descriptions.Item>
          <Descriptions.Item label={t('Packs en vigueur')}>
            {heldPacks.length > 0
              ? heldPacks.map(code => catalog.find(c => c.code === code)?.name ?? code).join(', ')
              : '—'}
          </Descriptions.Item>
        </Descriptions>
        {entitlements.enforcement !== 'enforce' && (
          <Alert
            style={{ marginTop: 'var(--space-3)' }}
            type="warning"
            showIcon
            message={t('Vérifications d’abonnement inactives')}
            description={ENFORCEMENT_NOTICE[entitlements.enforcement]}
          />
        )}
        {entitlements.manualReadOnlyReason ? (
          <Alert
            style={{ marginTop: 'var(--space-3)' }}
            type="error"
            showIcon
            message={
              <Space wrap>
                <span>{t('Lecture seule (manuelle)')}</span>
                <Button size="small" loading={manualReadOnlySaving} onClick={handleClearManualReadOnly}>
                  {t('Lever la lecture seule')}
                </Button>
              </Space>
            }
            description={t('Motif : {{value}}', { value: entitlements.manualReadOnlyReason })}
          />
        ) : (
          entitlements.readOnly && (
            <Alert
              style={{ marginTop: 'var(--space-3)' }}
              type="warning"
              showIcon
              message={t('Agence en lecture seule')}
              description={entitlements.readOnlyReason ?? undefined}
            />
          )
        )}
        <div style={{ marginTop: 'var(--space-3)' }}>
          {!entitlements.manualReadOnlyReason && (
            <Button size="small" danger loading={manualReadOnlySaving} onClick={handleSetManualReadOnly}>
              {t('Passer en lecture seule')}
            </Button>
          )}
        </div>
      </Card>

      <Card
        title={t('Consommation')}
        extra={
          <Button size="small" onClick={() => setOverrideOpen(true)}>
            {t('Accorder une dérogation')}
          </Button>
        }
      >
        <Space size="large" wrap style={{ width: '100%' }}>
          {(Object.keys(entitlements.capacities) as CapacityKeyCode[]).map(key => {
            const capacity = entitlements.capacities[key];
            const percent =
              capacity.limit > 0
                ? Math.min(100, Math.round((capacity.used / capacity.limit) * 100))
                : capacity.used > 0
                  ? 100
                  : 0;
            return (
              <div key={key} style={{ width: 220 }}>
                <Text strong>{CAPACITY_LABEL[key]}</Text>
                <Progress
                  percent={percent}
                  status={capacityTone(percent)}
                  strokeColor={capacityStrokeColor(percent)}
                  format={() => `${capacity.used} / ${capacity.limit}`}
                />
                {capacity.overBy > 0 && (
                  <Text type="danger" style={{ fontSize: 'var(--font-size-sm)' }}>
                    {t('{{value}} au-delà du plafond', { value: capacity.overBy })}
                  </Text>
                )}
              </div>
            );
          })}
        </Space>
      </Card>

      <Card
        title={t('Packs et extensions')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            {t('Ajouter')}
          </Button>
        }
      >
        <Table<SubscriptionItemDTO>
          dataSource={items}
          columns={itemColumns}
          rowKey="id"
          pagination={false}
          size="small"
          aria-label={t('Packs et extensions')}
        />
      </Card>

      <Card title={t('Dérogations')}>
        <Table<CapacityOverrideDTO>
          dataSource={overrides}
          columns={overrideColumns}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: t('Aucune dérogation') }}
          aria-label={t('Dérogations')}
        />
      </Card>

      <Card title={t('Modules inclus')}>
        <Space wrap>
          {(Object.keys(entitlements.moduleAccess) as Array<keyof typeof entitlements.moduleAccess>).map(key => {
            const access = entitlements.moduleAccess[key];
            const info = MODULE_ACCESS_LABEL[access];
            return (
              <Space key={key} size="small">
                <Text>{MODULE_LABEL[key] ?? key}</Text>
                <StatusTag status={access} tone={info.tone} label={info.label} />
              </Space>
            );
          })}
        </Space>
      </Card>

      <Card title={t('Prochaine facture (aperçu)')}>
        {invoicePreview ? (
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <Text type="secondary">
              {t('Période du {{start}} au {{end}}', {
                start: formatDateTime(invoicePreview.periodStart),
                end: formatDateTime(invoicePreview.periodEnd)
              })}
            </Text>
            {invoicePreview.lines.map((line, index) => (
              <div
                key={`${line.kind}-${index}`}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}
              >
                <Text style={{ flex: 1 }}>{line.label}</Text>
                <MoneyValue value={line.amount} signed />
              </div>
            ))}
            <Divider style={{ margin: 'var(--space-2) 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>{t('Total HT')}</Text>
              <MoneyValue value={invoicePreview.amountExclTax} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text>{t('TVA {{value}} %', { value: invoicePreview.taxRate })}</Text>
              <MoneyValue value={invoicePreview.taxAmount} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text strong>{t('Total TTC')}</Text>
              <Text strong>
                <MoneyValue value={invoicePreview.amountTotal} />
              </Text>
            </div>
          </Space>
        ) : (
          <Text type="secondary">{t('Aperçu indisponible.')}</Text>
        )}
      </Card>

      <Card title={t("Demandes d'extension")}>
        <Table<ExtensionRequest>
          dataSource={requests}
          rowKey="id"
          pagination={false}
          size="small"
          aria-label={t("Demandes d'extension")}
          locale={{ emptyText: t('Aucune demande') }}
          columns={[
            { title: t('Date'), dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => formatDateTime(v) },
            { title: t('Demandeur'), dataIndex: 'requestedByName', key: 'by', render: (v: string | null) => v ?? '—' },
            {
              title: t('Offre'),
              key: 'offer',
              render: (_, r) => (r.catalogName ? `${r.catalogName}${r.quantity ? ` × ${r.quantity}` : ''}` : '—')
            },
            { title: t('Message'), dataIndex: 'message', key: 'message' },
            {
              title: t('Statut'),
              dataIndex: 'status',
              key: 'status',
              render: (status: string) => {
                const info = REQUEST_STATUS_LABEL[status];
                return <StatusTag status={status} tone={info?.tone} label={info?.label} />;
              }
            },
            {
              title: t('Actions'),
              key: 'actions',
              render: (_, r) =>
                r.status === 'OPEN' ? (
                  <Space wrap>
                    <Button size="small" type="primary" onClick={() => handleCloseRequest(r, 'HANDLED')}>
                      {t('Marquer traitée')}
                    </Button>
                    <Button size="small" onClick={() => handleCloseRequest(r, 'DECLINED')}>
                      {t('Refuser')}
                    </Button>
                  </Space>
                ) : (
                  <Text type="secondary">—</Text>
                )
            }
          ]}
        />
      </Card>

      <AddItemModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        catalog={catalog}
        heldPacks={heldPacks}
        onSubmit={handleAddItem}
      />
      <OverrideModal open={overrideOpen} onClose={() => setOverrideOpen(false)} onSubmit={handleGrantOverride} />

      <ReasonPromptModal
        open={!!removeNowItem}
        title={t('Retirer « {{value}} » immédiatement ?', { value: removeNowItem?.name ?? '' })}
        reasonPlaceholder={t('Raison du retrait immédiat')}
        okText={t('Retirer immédiatement')}
        cancelText={t('Annuler')}
        danger
        confirmLoading={removeNowSaving}
        onCancel={() => setRemoveNowItem(null)}
        onConfirm={confirmRemoveNow}
      />

      <ReasonPromptModal
        open={!!discountItem}
        title={t('Modifier « {{value}} »', { value: discountItem?.name ?? '' })}
        reasonRequired={false}
        reasonPlaceholder={t('Raison de la modification')}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={discountSaving}
        onCancel={() => setDiscountItem(null)}
        onConfirm={confirmEditDiscount}
        extraContent={
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>{t('Remise (%)')}</Text>
            <InputNumber
              aria-label={t('Remise (%)')}
              min={0}
              max={100}
              value={discountValues.discountPercent}
              style={{ width: '100%' }}
              onChange={value => setDiscountValues(v => ({ ...v, discountPercent: Number(value) || 0 }))}
            />
            <Text>{t('Prix mensuel figé (HT, par unité)')}</Text>
            <InputNumber
              aria-label={t('Prix mensuel figé (HT, par unité)')}
              min={0}
              step={100}
              value={discountValues.unitMonthlyPrice}
              style={{ width: '100%' }}
              onChange={value => setDiscountValues(v => ({ ...v, unitMonthlyPrice: Number(value) || 0 }))}
            />
            <Text type="secondary">{t('Prend effet sur la prochaine facture, sans prorata.')}</Text>
          </Space>
        }
      />

      <ReasonPromptModal
        open={manualReadOnlyPromptOpen}
        title={t('Passer « {{value}} » en lecture seule ?', { value: tenantName ?? '' })}
        reasonPlaceholder={t('Motif (obligatoire)')}
        okText={t('Passer en lecture seule')}
        cancelText={t('Annuler')}
        danger
        confirmLoading={manualReadOnlySaving}
        onCancel={() => setManualReadOnlyPromptOpen(false)}
        onConfirm={confirmSetManualReadOnly}
        description={
          <Text type="secondary">
            {t(
              "Bloque les écritures de l'agence jusqu'à ce que vous leviez cette mesure vous-même. Ni un paiement ni la tâche planifiée ne la lèvent. Portails, paiements et factures restent accessibles."
            )}
          </Text>
        }
      />
    </Space>
  );
};
