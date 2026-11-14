import React from 'react';
import { Alert, Button, Card, Popconfirm, Space, Tag } from 'antd';
import { MoneyValue, Table } from '../../primitives';
import type { ExpenseCategory, ExpenseRecurrence, PropertyExpense } from '../../../types/patrimoine-types';
import { t } from '../../../i18n/t';
import { activeLocale } from '../../../i18n/format';
import { localizedList } from '../../../i18n/localized';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import {
  DEVISE_PATRIMOINE,
  EXPENSE_RECURRENCES,
  expenseCategoryLabel,
  expenseRecurrenceLabel
} from '../patrimoine-labels';

const CATEGORIES: readonly ExpenseCategory[] = [
  'PROPERTY_TAX',
  'CONDO_FEES',
  'INSURANCE',
  'ROUTINE_MAINTENANCE',
  'RENOVATION',
  'MANAGEMENT_FEES',
  'UTILITIES',
  'OTHER'
];

const OPTIONS_CATEGORIE = localizedList(() =>
  CATEGORIES.map(category => ({ value: category, label: expenseCategoryLabel(category) }))
);
const OPTIONS_RECURRENCE = localizedList(() =>
  EXPENSE_RECURRENCES.map(recurrence => ({ value: recurrence, label: expenseRecurrenceLabel(recurrence) }))
);

// Accesseurs stables (hors composant). Champ libre : libellé, notes, fournisseur, catégorie affichée.
const TEXTE_RECHERCHE = [
  (e: PropertyExpense) => e.label,
  (e: PropertyExpense) => e.notes,
  (e: PropertyExpense) => e.supplierName,
  (e: PropertyExpense) => expenseCategoryLabel(e.category)
];
const ACCESSEURS = {
  categorie: (e: PropertyExpense) => e.category,
  date: (e: PropertyExpense) => e.paidAt,
  montant: (e: PropertyExpense) => e.amount,
  capitalisee: (e: PropertyExpense) => e.isCapitalized,
  // Une dépense sans périodicité est ponctuelle (comme l'affichage).
  recurrence: (e: PropertyExpense): ExpenseRecurrence => e.recurrence ?? 'ONE_OFF'
};

interface Props {
  expenses: PropertyExpense[];
  error?: string;
  busyActionId: string | null;
  onAdd: () => void;
  onEdit: (item: PropertyExpense) => void;
  onDelete: (id: string) => void;
}

/** Rubrique « Dépenses » : tableau de gestion, recherche locale `dep.*`, pages de 10. */
export const ExpensesSection: React.FC<Props> = ({ expenses, error, busyActionId, onAdd, onEdit, onDelete }) => {
  const criteres: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Libellé, notes, fournisseur, catégorie…') },
    { key: 'categorie', type: 'multiSelect', label: t('Catégorie'), primary: true, options: OPTIONS_CATEGORIE },
    { key: 'date', type: 'dateRange', label: t('Date de paiement'), primary: true },
    { key: 'montant', type: 'numberRange', label: t('Montant'), unit: DEVISE_PATRIMOINE },
    { key: 'capitalisee', type: 'boolean', label: t('Capitalisée'), tristate: true },
    { key: 'recurrence', type: 'multiSelect', label: t('Périodicité'), options: OPTIONS_RECURRENCE }
  ];
  const local = useLocalListSearch<PropertyExpense>(expenses, {
    paramPrefix: 'dep',
    ariaLabel: t('Rechercher dans les dépenses'),
    defaultPageSize: 10,
    criteria: criteres,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  return (
    <Card
      title={t('Gérer les dépenses')}
      extra={
        <Button type="primary" onClick={onAdd}>
          {t('Ajouter')}
        </Button>
      }
    >
      {error ? (
        <Alert type="error" showIcon message={error} />
      ) : (
        <Table<PropertyExpense>
          helpId="patrimoine.bien.depenses"
          {...local.tableProps}
          exportFilename={t('Gérer les dépenses')}
          exportFetchAll={local.exportAll}
          scroll={{ x: 'max-content' }}
          rowKey="id"
          locale={local.isFiltered ? undefined : { emptyText: t('Aucune dépense pour ce bien.') }}
          columns={[
            {
              title: t('Date'),
              dataIndex: 'paidAt',
              render: (value: string) => new Date(value).toLocaleDateString(activeLocale())
            },
            { title: t('Libellé'), dataIndex: 'label' },
            {
              title: t('Catégorie'),
              dataIndex: 'category',
              render: (value: PropertyExpense['category']) => <Tag>{expenseCategoryLabel(value)}</Tag>
            },
            {
              title: t('Périodicité'),
              dataIndex: 'recurrence',
              render: (value: PropertyExpense['recurrence']) => expenseRecurrenceLabel(value)
            },
            {
              title: t('Montant'),
              dataIndex: 'amount',
              render: (value: number, record: PropertyExpense) => (
                <MoneyValue value={value} currency={record.currency} />
              )
            },
            {
              title: t('Actions'),
              key: 'actions',
              render: (_: unknown, record: PropertyExpense) => (
                <Space>
                  <Button size="small" onClick={() => onEdit(record)}>
                    {t('Modifier')}
                  </Button>
                  <Popconfirm title={t('Supprimer cette dépense ?')} onConfirm={() => onDelete(record.id)}>
                    <Button size="small" danger loading={busyActionId === `expense-${record.id}`}>
                      {t('Supprimer')}
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
      )}
    </Card>
  );
};
