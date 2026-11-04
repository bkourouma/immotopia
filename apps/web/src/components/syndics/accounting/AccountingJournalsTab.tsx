import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import { Table } from '../../primitives';
import type { AccountingJournal } from '../../../types/syndic-types';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { t } from '../../../i18n/t';
import { JOURNALS_PREFIX, LOCAL_PAGE_SIZE_LISTS } from './accounting-shared';

// Accesseurs stables (hors composant) : le filtrage reste mémoïsé.
const TEXTE_RECHERCHE = [(journal: AccountingJournal) => journal.code, (journal: AccountingJournal) => journal.label];
const ACCESSEURS = {
  type: (journal: AccountingJournal) => journal.journalType,
  exercice: (journal: AccountingJournal) => String(journal.fiscalYear)
};

/** Types de journaux proposés à la création ; un type inconnu de cette liste s'affiche sous son code. */
const KNOWN_JOURNAL_TYPES: string[] = ['GENERAL', 'BANK', 'CASH', 'CHARGES'];

const journalTypeLabel = (type: string): string => {
  switch (type) {
    case 'GENERAL':
      return t('Général');
    case 'BANK':
      return t('Banque');
    case 'CASH':
      return t('Caisse');
    case 'CHARGES':
      return t('Charges');
    default:
      return type;
  }
};

interface AccountingJournalsTabProps {
  /** Journaux de la copropriété (liste bornée), chargés une fois par l'écran. */
  journals: AccountingJournal[];
  loading: boolean;
}

/** Journaux comptables : liste bornée reçue en entier, recherche et pagination locales (préfixe `jnl`). */
export const AccountingJournalsTab: React.FC<AccountingJournalsTabProps> = ({ journals, loading }) => {
  const typeValues = useMemo(() => {
    const extra = journals
      .map(journal => journal.journalType as string)
      .filter(type => !KNOWN_JOURNAL_TYPES.includes(type));
    return [...KNOWN_JOURNAL_TYPES, ...Array.from(new Set(extra))];
  }, [journals]);
  const years = useMemo(
    () => Array.from(new Set(journals.map(journal => journal.fiscalYear))).sort((a, b) => b - a),
    [journals]
  );

  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Code ou libellé du journal…')
    },
    {
      key: 'type',
      type: 'multiSelect',
      label: t('Type'),
      primary: true,
      options: typeValues.map(value => ({ value, label: journalTypeLabel(value) }))
    },
    {
      key: 'exercice',
      type: 'multiSelect',
      label: t('Exercice'),
      primary: true,
      options: years.map(year => ({ value: String(year), label: String(year) }))
    }
  ];

  const local = useLocalListSearch<AccountingJournal>(journals, {
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS,
    defaultPageSize: LOCAL_PAGE_SIZE_LISTS,
    paramPrefix: JOURNALS_PREFIX,
    ariaLabel: t('Rechercher dans les journaux')
  });

  const columns = useMemo(
    () => [
      { title: t('Code'), dataIndex: 'code' },
      { title: t('Libellé'), dataIndex: 'label' },
      { title: t('Type'), dataIndex: 'journalType', render: (value: string) => journalTypeLabel(value) },
      { title: t('Exercice'), dataIndex: 'fiscalYear' },
      {
        title: t('Créé le'),
        dataIndex: 'createdAt',
        render: (value: string) => dayjs(value).format('DD/MM/YYYY')
      }
    ],
    []
  );

  return (
    <Table<AccountingJournal>
      {...local.tableProps}
      exportFilename={t('Journaux comptables')}
      exportFetchAll={local.exportAll}
      scroll={{ x: 'max-content' }}
      rowKey="id"
      loading={loading}
      columns={columns}
    />
  );
};
