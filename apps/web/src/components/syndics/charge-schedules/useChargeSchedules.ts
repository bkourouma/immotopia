import { useScheduleActions } from './useScheduleActions';
import { useScheduleData } from './useScheduleData';
import { useScheduleDrawer } from './useScheduleDrawer';

/**
 * Onglet « Programmation » (lot S4, besoin 6) : appels de charges
 * automatiques. Contrat :
 * `packages/api/src/routes/syndic-charge-schedules-routes.ts`.
 *
 * Compose les trois hooks de la fonctionnalité : lecture (liste, aperçu,
 * historique), tiroir (création/édition) et actions (pause, reprise,
 * suppression, exécution immédiate).
 */
export function useChargeSchedules(tenantId: string | undefined, syndicId: string | undefined) {
  const data = useScheduleData(tenantId, syndicId);

  const drawer = useScheduleDrawer(tenantId, syndicId, {
    loadData: data.loadData,
    preview: data.preview,
    loadPreview: data.loadPreview,
    resetPreview: data.resetPreview,
    runs: data.runs,
    loadRuns: data.loadRuns,
    resetRuns: data.resetRuns
  });

  const actions = useScheduleActions(tenantId, syndicId, {
    loadData: data.loadData,
    editingId: drawer.editing?.id,
    loadRuns: data.loadRuns
  });

  return {
    schedules: data.schedules,
    loading: data.loading,
    error: data.error,
    approvedBudgetOptions: data.approvedBudgetOptions,
    preview: data.preview,
    previewLoading: data.previewLoading,
    runs: data.runs,
    runsLoading: data.runsLoading,

    submitting: drawer.submitting,
    drawerOpen: drawer.drawerOpen,
    editing: drawer.editing,
    drawerTab: drawer.drawerTab,
    form: drawer.form,
    watchedAmountSource: drawer.watchedAmountSource,
    watchedFrequency: drawer.watchedFrequency,
    openCreateDrawer: drawer.openCreateDrawer,
    openEditDrawer: drawer.openEditDrawer,
    closeDrawer: drawer.closeDrawer,
    handleDrawerTabChange: drawer.handleDrawerTabChange,
    handleSubmit: drawer.handleSubmit,

    busyId: actions.busyId,
    handlePause: actions.handlePause,
    handleResume: actions.handleResume,
    handleDelete: actions.handleDelete,
    handleExecute: actions.handleExecute
  };
}
