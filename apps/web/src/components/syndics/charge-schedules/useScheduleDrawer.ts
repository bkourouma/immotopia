import { useMemo, useState } from 'react';
import { App, Form } from 'antd';
import dayjs from 'dayjs';
import {
  createChargeSchedule,
  pauseChargeSchedule,
  resumeChargeSchedule,
  updateChargeSchedule
} from '../../../services/syndic-charge-schedule-service';
import {
  ChargeAllocationMethod,
  ChargeSchedule,
  ChargeSchedulePreview,
  ChargeScheduleRun,
  CreateChargeScheduleRequest,
  SyndicateLot
} from '../../../types/syndic-types';
import { t } from '../../../i18n/t';
import { previewScheduleAllocation } from '../../../utils/charge-allocation-preview';
import { ratesUnavailableMessage, useLotTypeRatesForAllocation } from '../charge-allocation/ChargeAllocationControls';
import { ScheduleFormValues } from './types';

interface UseScheduleDrawerArgs {
  /** Lots de la copropriété (aperçu par lot avant enregistrement). */
  lots: SyndicateLot[];
  loadData: () => Promise<void>;
  preview: ChargeSchedulePreview | null;
  loadPreview: (scheduleId: string) => Promise<void>;
  resetPreview: () => void;
  runs: ChargeScheduleRun[];
  loadRuns: (scheduleId: string) => Promise<void>;
  resetRuns: () => void;
}

/** Ouverture/fermeture du tiroir (création ou édition) et soumission du formulaire. */
export function useScheduleDrawer(
  tenantId: string | undefined,
  syndicId: string | undefined,
  args: UseScheduleDrawerArgs
) {
  const { message } = App.useApp();
  const { lots, loadData, preview, loadPreview, resetPreview, runs, loadRuns, resetRuns } = args;

  const [submitting, setSubmitting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ChargeSchedule | null>(null);
  const [drawerTab, setDrawerTab] = useState('form');
  const [form] = Form.useForm<ScheduleFormValues>();
  const watchedSource = Form.useWatch('amountSource', form);
  const watchedMethod = Form.useWatch('allocationMethod', form);
  const watchedTotal = Form.useWatch('fixedAmount', form);
  const watchedAnnex = Form.useWatch('includeAnnexLots', form);
  const watchedMoney = Form.useWatch('currency', form);

  // Seule la source « Montant fixe » choisit un mode ; un budget garde la clé de répartition de ses postes.
  const allocationMethod: ChargeAllocationMethod | null =
    watchedSource === 'FIXED' ? (watchedMethod ?? 'SHARES') : null;
  // Barème chargé seulement quand le tiroir est ouvert sur « Par type de lot ».
  const { rates: lotTypeRates, status: lotTypeRatesStatus } = useLotTypeRatesForAllocation(
    tenantId,
    syndicId,
    drawerOpen && allocationMethod === 'BY_LOT_TYPE'
  );
  const inputFor = (method: ChargeAllocationMethod, total: number | null | undefined) => ({
    method,
    lots,
    totalAmount: total,
    lotTypeRates,
    includeAnnexLots: form.getFieldValue('includeAnnexLots') ?? true,
    currency: form.getFieldValue('currency') || 'XOF'
  });
  const allocationPreview = useMemo(
    () =>
      allocationMethod && lots.length > 0 && (allocationMethod === 'BY_LOT_TYPE' || Number(watchedTotal) > 0)
        ? previewScheduleAllocation({
            method: allocationMethod,
            lots,
            totalAmount: watchedTotal,
            lotTypeRates,
            includeAnnexLots: watchedAnnex ?? true,
            currency: watchedMoney || 'XOF'
          })
        : null,
    [allocationMethod, lots, watchedTotal, lotTypeRates, watchedAnnex, watchedMoney]
  );

  const openCreateDrawer = () => {
    setEditing(null);
    resetPreview();
    resetRuns();
    setDrawerTab('form');
    form.resetFields();
    form.setFieldsValue({
      frequency: 'MONTHLY',
      issueDay: 1,
      dueOffsetDays: 15,
      amountSource: 'BUDGET',
      allocationMethod: 'SHARES',
      includeAnnexLots: true,
      currency: 'XOF',
      startDate: dayjs().format('YYYY-MM-DD'),
      active: true
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (schedule: ChargeSchedule) => {
    setEditing(schedule);
    resetPreview();
    resetRuns();
    setDrawerTab('form');
    form.resetFields();
    form.setFieldsValue({
      label: schedule.label,
      frequency: schedule.frequency,
      issueDay: schedule.issueDay,
      dueOffsetDays: schedule.dueOffsetDays,
      amountSource: schedule.amountSource,
      budgetId: schedule.budgetId ?? undefined,
      fixedAmount: schedule.fixedAmount ?? undefined,
      allocationMethod: schedule.allocationMethod ?? 'SHARES',
      // Absent des anciennes réponses = calcul historique (lots principaux).
      includeAnnexLots: schedule.includeAnnexLots ?? false,
      currency: schedule.currency,
      startDate: schedule.startDate,
      endDate: schedule.endDate ?? undefined,
      active: schedule.active
    });
    setDrawerOpen(true);
    void loadPreview(schedule.id);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
    resetPreview();
    resetRuns();
  };

  const handleDrawerTabChange = (key: string) => {
    setDrawerTab(key);
    if (!editing) return;
    if (key === 'apercu' && !preview) void loadPreview(editing.id);
    if (key === 'historique' && runs.length === 0) void loadRuns(editing.id);
  };

  const handleSubmit = async () => {
    if (!tenantId || !syndicId) return;
    let values: ScheduleFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const isFixed = values.amountSource === 'FIXED';
    const method: ChargeAllocationMethod = isFixed ? (values.allocationMethod ?? 'SHARES') : 'SHARES';
    if (isFixed) {
      // Même contrôle que l'API (messages identiques) : on bloque d'avance une saisie qu'elle refuserait.
      if (method === 'BY_LOT_TYPE' && lotTypeRates === null) {
        message.error(ratesUnavailableMessage());
        return;
      }
      const check = lots.length > 0 ? previewScheduleAllocation(inputFor(method, values.fixedAmount)) : null;
      if (check?.error) {
        message.error(check.error);
        return;
      }
    }
    // `active` n'appartient pas au PATCH (schéma strict côté API) : l'état actif/en
    // pause passe par les routes dédiées `pause` et `reprise`.
    const { active, ...payload }: CreateChargeScheduleRequest = {
      label: values.label,
      frequency: values.frequency,
      issueDay: values.issueDay,
      dueOffsetDays: values.dueOffsetDays,
      amountSource: values.amountSource,
      budgetId: values.amountSource === 'BUDGET' ? values.budgetId || null : null,
      fixedAmount: isFixed && method !== 'BY_LOT_TYPE' ? (values.fixedAmount ?? null) : null,
      allocationMethod: method,
      ...(isFixed && method === 'SHARES' ? { includeAnnexLots: values.includeAnnexLots ?? true } : {}),
      currency: values.currency || 'XOF',
      startDate: values.startDate,
      endDate: values.endDate || null,
      active: values.active
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateChargeSchedule(tenantId, syndicId, editing.id, payload);
        if (active !== undefined && active !== editing.active) {
          if (active) await resumeChargeSchedule(tenantId, syndicId, editing.id);
          else await pauseChargeSchedule(tenantId, syndicId, editing.id);
        }
        message.success(t('Programmation modifiée'));
      } else {
        await createChargeSchedule(tenantId, syndicId, { ...payload, active });
        message.success(t('Programmation créée'));
      }
      closeDrawer();
      await loadData();
    } catch (err: any) {
      const fieldErrors: Array<{ field: string; message: string }> | undefined = err.response?.data?.errors;
      if (fieldErrors && fieldErrors.length > 0) {
        fieldErrors.forEach(fieldErr =>
          form.setFields([{ name: fieldErr.field as keyof ScheduleFormValues, errors: [fieldErr.message] }])
        );
      }
      message.error(err.response?.data?.error || t('Enregistrement de la programmation impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const watchedAmountSource = Form.useWatch('amountSource', form);
  const watchedFrequency = Form.useWatch('frequency', form);

  return {
    submitting,
    drawerOpen,
    editing,
    drawerTab,
    form,
    watchedAmountSource,
    watchedFrequency,
    allocationMethod,
    includeAnnexLots: watchedAnnex ?? true,
    allocationPreview,
    lotTypeRatesStatus,
    openCreateDrawer,
    openEditDrawer,
    closeDrawer,
    handleDrawerTabChange,
    handleSubmit
  };
}
