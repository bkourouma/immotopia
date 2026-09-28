import { useState } from 'react';
import { App, Form } from 'antd';
import dayjs from 'dayjs';
import { createChargeSchedule, updateChargeSchedule } from '../../../services/syndic-charge-schedule-service';
import {
  ChargeSchedule,
  ChargeSchedulePreview,
  ChargeScheduleRun,
  CreateChargeScheduleRequest
} from '../../../types/syndic-types';
import { t } from '../../../i18n/t';
import { ScheduleFormValues } from './types';

interface UseScheduleDrawerArgs {
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
  const { loadData, preview, loadPreview, resetPreview, runs, loadRuns, resetRuns } = args;

  const [submitting, setSubmitting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ChargeSchedule | null>(null);
  const [drawerTab, setDrawerTab] = useState('form');
  const [form] = Form.useForm<ScheduleFormValues>();

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
    const payload: CreateChargeScheduleRequest = {
      label: values.label,
      frequency: values.frequency,
      issueDay: values.issueDay,
      dueOffsetDays: values.dueOffsetDays,
      amountSource: values.amountSource,
      budgetId: values.amountSource === 'BUDGET' ? values.budgetId || null : null,
      fixedAmount: values.amountSource === 'FIXED' ? (values.fixedAmount ?? null) : null,
      currency: values.currency || 'XOF',
      startDate: values.startDate,
      endDate: values.endDate || null,
      active: values.active
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateChargeSchedule(tenantId, syndicId, editing.id, payload);
        message.success(t('Programmation modifiée'));
      } else {
        await createChargeSchedule(tenantId, syndicId, payload);
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
    openCreateDrawer,
    openEditDrawer,
    closeDrawer,
    handleDrawerTabChange,
    handleSubmit
  };
}
