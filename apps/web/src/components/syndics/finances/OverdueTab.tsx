import React, { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { DataCard, DataView, MoneyValue } from '../../primitives';
import type { OverdueDashboard } from '../../../types/syndic-types';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { t } from '../../../i18n/t';
import { buildOverdueRows, financeLoadError, type OverdueRow } from './finance-rows';
import { sortRows } from './useLocalTable';

interface OverdueTabProps {
  tenantId: string;
  syndicId: string;
  /** Tableau de bord des retards, déjà chargé par la page (il alimente aussi les cartes). */
  dashboard: OverdueDashboard;
  dashboardLoading: boolean;
  dashboardError: unknown;
  onRetryDashboard: () => void;
}

// Accesseurs et prédicats stables (hors du composant) : le filtrage reste mémoïsé.
const TEXTE_RECHERCHE = [(row: OverdueRow) => row.lotLabel, (row: OverdueRow) => row.ownerLabel];
const ACCESSEURS = {
  late: (row: OverdueRow) => row.daysLate,
  outstanding: (row: OverdueRow) => row.outstanding
};
const PREDICATS = {
  reminded: (row: OverdueRow, value: unknown) => row.remindersCount > 0 === value
};

/**
 * Impayés et retards : le tableau de bord /retards (borné aux appels en
 * retard), recherche, tri et pagination en local (préfixe d'URL « im »). Le
 * nombre de relances par appel (`remindersCount`) est calculé côté serveur.
 */
export const OverdueTab: React.FC<OverdueTabProps> = ({
  dashboard,
  dashboardLoading,
  dashboardError,
  onRetryDashboard
}) => {
  const rows = useMemo(() => buildOverdueRows(dashboard), [dashboard]);

  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Lot, copropriétaire…') },
    { key: 'late', type: 'numberRange', label: t('Jours de retard'), primary: true, unit: t('jours') },
    { key: 'outstanding', type: 'numberRange', label: t('Montant dû'), unit: 'FCFA' },
    {
      key: 'reminded',
      type: 'boolean',
      label: t('Relances'),
      tristate: true,
      trueLabel: t('Déjà relancé'),
      falseLabel: t('Jamais relancé')
    }
  ];

  const local = useLocalListSearch<OverdueRow>(rows, {
    paramPrefix: 'im',
    ariaLabel: t('Rechercher dans les impayés et retards'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS,
    predicates: PREDICATS,
    sortItems: sortRows
  });

  const columns: ColumnsType<OverdueRow> = [
    { title: t('Lot'), dataIndex: 'lotLabel', key: 'lotLabel' },
    { title: t('Copropriétaire'), dataIndex: 'ownerLabel', key: 'ownerLabel' },
    {
      title: t('Montant dû'),
      dataIndex: 'outstanding',
      key: 'outstanding',
      align: 'end',
      sorter: true,
      render: (_: number, row) => <MoneyValue value={row.outstanding} />
    },
    { title: t('Jours de retard'), dataIndex: 'daysLate', key: 'daysLate', align: 'end', sorter: true },
    { title: t('Relances'), dataIndex: 'remindersCount', key: 'remindersCount', align: 'end', sorter: true }
  ];

  return (
    <DataView<OverdueRow>
      {...local.dataViewProps}
      loading={dashboardLoading}
      error={financeLoadError(dashboardError)}
      errorCause={dashboardError}
      onRetry={onRetryDashboard}
      emptyDescription={t('Aucun dossier en retard pour cette copropriété.')}
      columns={columns}
      rowKey={row => row.chargeCallId}
      aria-label={t('Détail des impayés et retards')}
      export={{ filename: t('Détail des impayés et retards'), fetchAll: local.exportAll }}
      renderCard={row => (
        <DataCard
          title={`${row.lotLabel} — ${row.ownerLabel}`}
          aria-label={row.lotLabel}
          highlight={<MoneyValue value={row.outstanding} />}
          fields={[
            { label: t('Jours de retard'), value: row.daysLate },
            { label: t('Relances'), value: row.remindersCount }
          ]}
        />
      )}
    />
  );
};
