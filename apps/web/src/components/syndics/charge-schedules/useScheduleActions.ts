import { useState } from 'react';
import { App } from 'antd';
import { useConfirmAction } from '../../primitives';
import {
  deleteChargeSchedule,
  executeChargeScheduleNow,
  pauseChargeSchedule,
  resumeChargeSchedule
} from '../../../services/syndic-charge-schedule-service';
import { ChargeSchedule } from '../../../types/syndic-types';
import { t } from '../../../i18n/t';
import { describeScheduleError } from './chargeScheduleLabels';

interface UseScheduleActionsArgs {
  loadData: () => Promise<void>;
  editingId: string | undefined;
  loadRuns: (scheduleId: string) => Promise<void>;
}

/** Pause, reprise, suppression et exécution immédiate d'une programmation. */
export function useScheduleActions(
  tenantId: string | undefined,
  syndicId: string | undefined,
  args: UseScheduleActionsArgs
) {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();
  const { loadData, editingId, loadRuns } = args;

  const [busyId, setBusyId] = useState<string | null>(null);

  const handlePause = async (schedule: ChargeSchedule) => {
    if (!tenantId || !syndicId) return;
    setBusyId(schedule.id);
    try {
      await pauseChargeSchedule(tenantId, syndicId, schedule.id);
      message.success(t('Programmation mise en pause'));
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Mise en pause impossible'));
    } finally {
      setBusyId(null);
    }
  };

  const handleResume = async (schedule: ChargeSchedule) => {
    if (!tenantId || !syndicId) return;
    setBusyId(schedule.id);
    try {
      await resumeChargeSchedule(tenantId, syndicId, schedule.id);
      message.success(t('Programmation reprise'));
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Reprise impossible'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (schedule: ChargeSchedule) => {
    if (!tenantId || !syndicId) return;
    setBusyId(schedule.id);
    try {
      const result = await deleteChargeSchedule(tenantId, syndicId, schedule.id);
      message.success(
        result.deleted
          ? t('Programmation supprimée')
          : t('Des appels ont déjà été émis : la programmation a été désactivée plutôt que supprimée.')
      );
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Suppression impossible'));
    } finally {
      setBusyId(null);
    }
  };

  const handleExecute = (schedule: ChargeSchedule) => {
    confirmAction({
      title: t('Exécuter la programmation « {{label}} » maintenant ?', { label: schedule.label }),
      description: t(
        'La période due (ou en cours) sera émise immédiatement : appels de charges, imputation des avances, quittances et notifications. Une exécution déjà faite pour cette période ne recrée rien.'
      ),
      okText: t('Exécuter'),
      onConfirm: async () => {
        if (!tenantId || !syndicId) return;
        setBusyId(schedule.id);
        try {
          const result = await executeChargeScheduleNow(tenantId, syndicId, schedule.id);
          const { run } = result;
          if (run.status === 'FAILED') {
            message.error(
              t('Exécution en échec — {{period}} : {{error}}', {
                period: run.periodLabel,
                error: describeScheduleError(run.error) || t('Erreur inconnue.')
              })
            );
          } else if (run.alreadyProcessed || run.status === 'SKIPPED') {
            message.info(t('Période {{period}} déjà traitée : rien à créer.', { period: run.periodLabel }));
          } else {
            const counts = {
              period: run.periodLabel,
              created: run.callsCreated,
              covered: run.callsCovered,
              notified: run.notificationsSent,
              skipped: run.notificationsSkipped
            };
            // Deux appels à t() littéraux : l'extracteur ne lit pas un ternaire passé à t().
            message.success(
              run.notificationsSkipped > 0
                ? t(
                    "Exécution réussie — {{period}} : {{created}} appel(s) créé(s), {{covered}} couvert(s) par une avance, {{notified}} notification(s) envoyée(s), {{skipped}} avis non envoyé(s) (détail dans l'historique).",
                    counts
                  )
                : t(
                    'Exécution réussie — {{period}} : {{created}} appel(s) créé(s), {{covered}} couvert(s) par une avance, {{notified}} notification(s) envoyée(s).',
                    counts
                  )
            );
          }
          await loadData();
          if (editingId === schedule.id) void loadRuns(schedule.id);
        } catch (err: any) {
          message.error(err.response?.data?.error || t('Exécution impossible'));
        } finally {
          setBusyId(null);
        }
      }
    });
  };

  return { busyId, handlePause, handleResume, handleDelete, handleExecute };
}
