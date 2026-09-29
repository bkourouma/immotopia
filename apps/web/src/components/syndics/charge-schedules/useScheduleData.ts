import { useEffect, useMemo, useState } from 'react';
import { App } from 'antd';
import { listBudgets } from '../../../services/syndic-service';
import {
  listChargeScheduleRuns,
  listChargeSchedules,
  previewChargeSchedule
} from '../../../services/syndic-charge-schedule-service';
import { ChargeSchedule, ChargeSchedulePreview, ChargeScheduleRun, SyndicateBudget } from '../../../types/syndic-types';
import { t } from '../../../i18n/t';

/**
 * Chargement des données en lecture de l'onglet Programmation : liste des
 * programmations et budgets, aperçu des prochaines périodes, historique des
 * exécutions. Le tiroir (création/édition, actions) vit dans les hooks
 * `useScheduleDrawer` et `useScheduleActions`.
 */
export function useScheduleData(tenantId: string | undefined, syndicId: string | undefined) {
  const { message } = App.useApp();

  const [schedules, setSchedules] = useState<ChargeSchedule[]>([]);
  const [budgets, setBudgets] = useState<SyndicateBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<ChargeSchedulePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [runs, setRuns] = useState<ChargeScheduleRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  useEffect(() => {
    if (!tenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres programmation manquants'));
      return;
    }
    void loadData();
  }, [tenantId, syndicId]);

  const loadData = async () => {
    if (!tenantId || !syndicId) return;
    setLoading(true);
    setError(null);
    try {
      const [schedulesData, budgetsData] = await Promise.all([
        listChargeSchedules(tenantId, syndicId),
        listBudgets(tenantId, syndicId)
      ]);
      setSchedules(schedulesData);
      setBudgets(budgetsData);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger les programmations'));
    } finally {
      setLoading(false);
    }
  };

  const approvedBudgetOptions = useMemo(
    () =>
      budgets
        .filter(budget => budget.status === 'APPROVED')
        .map(budget => ({ value: budget.id, label: `${budget.label} (${budget.fiscalYear})` })),
    [budgets]
  );

  const loadPreview = async (scheduleId: string) => {
    if (!tenantId || !syndicId) return;
    setPreviewLoading(true);
    try {
      setPreview(await previewChargeSchedule(tenantId, syndicId, scheduleId));
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Aperçu des prochaines périodes impossible'));
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadRuns = async (scheduleId: string) => {
    if (!tenantId || !syndicId) return;
    setRunsLoading(true);
    try {
      setRuns(await listChargeScheduleRuns(tenantId, syndicId, scheduleId, 50));
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Historique des exécutions impossible à charger'));
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  };

  return {
    schedules,
    loading,
    error,
    loadData,
    approvedBudgetOptions,
    preview,
    previewLoading,
    loadPreview,
    resetPreview: () => setPreview(null),
    runs,
    runsLoading,
    loadRuns,
    resetRuns: () => setRuns([])
  };
}
