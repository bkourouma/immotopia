import React from 'react';
import { Alert, Button, Card, Popconfirm, Progress, Space, Tag } from 'antd';
import { MoneyValue, Table } from '../../primitives';
import type { PropertyLoan } from '../../../types/patrimoine-types';
import { t } from '../../../i18n/t';
import { localizedList } from '../../../i18n/localized';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { loanStatusLabel } from '../patrimoine-labels';

const OPTIONS_STATUT = localizedList(() =>
  (['ACTIVE', 'CLOSED', 'DEFAULTED'] as const).map(status => ({ value: status, label: loanStatusLabel(status) }))
);

// Accesseurs stables (hors composant). Un crédit n'a pas de libellé : on cherche le prêteur et le statut affiché.
const TEXTE_RECHERCHE = [(l: PropertyLoan) => l.lender, (l: PropertyLoan) => loanStatusLabel(l.status)];
const ACCESSEURS = { statut: (l: PropertyLoan) => l.status };

/** Part du capital déjà remboursée, bornée à 0-100 % (calcul de l'ancien widget « Crédits immobiliers »). */
function paidPercent(loan: PropertyLoan): number {
  const total = Number(loan.capitalAmount) || 1;
  return Math.max(0, Math.min(100, ((total - Number(loan.remainingCapital)) / total) * 100));
}

interface Props {
  loans: PropertyLoan[];
  error?: string;
  busyActionId: string | null;
  onAdd: () => void;
  onEdit: (item: PropertyLoan) => void;
  onDelete: (id: string) => void;
}

/** Rubrique « Crédits » : tableau de gestion, recherche locale `cre.*`, pages de 10. */
export const LoansSection: React.FC<Props> = ({ loans, error, busyActionId, onAdd, onEdit, onDelete }) => {
  const criteres: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Prêteur, banque…') },
    { key: 'statut', type: 'multiSelect', label: t('Statut'), primary: true, options: OPTIONS_STATUT }
  ];
  const local = useLocalListSearch<PropertyLoan>(loans, {
    paramPrefix: 'cre',
    ariaLabel: t('Rechercher dans les crédits'),
    defaultPageSize: 10,
    criteria: criteres,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  return (
    <Card
      title={t('Gérer les crédits')}
      extra={
        <Button type="primary" onClick={onAdd}>
          {t('Ajouter')}
        </Button>
      }
    >
      {error ? (
        <Alert type="error" showIcon message={error} />
      ) : (
        <Table<PropertyLoan>
          helpId="patrimoine.bien.credits"
          {...local.tableProps}
          exportFilename={t('Gérer les crédits')}
          exportFetchAll={local.exportAll}
          scroll={{ x: 'max-content' }}
          rowKey="id"
          locale={local.isFiltered ? undefined : { emptyText: t('Aucun crédit pour ce bien.') }}
          columns={[
            { title: t('Prêteur'), dataIndex: 'lender' },
            {
              title: t('Capital restant'),
              dataIndex: 'remainingCapital',
              render: (value: number, record: PropertyLoan) => <MoneyValue value={value} currency={record.currency} />
            },
            {
              title: t('Mensualité'),
              dataIndex: 'monthlyPayment',
              render: (value: number, record: PropertyLoan) => <MoneyValue value={value} currency={record.currency} />
            },
            {
              title: t('Remboursé'),
              key: 'repaid',
              exportValue: (record: PropertyLoan) => `${Math.round(paidPercent(record))} %`,
              render: (_: unknown, record: PropertyLoan) => (
                <Progress percent={Math.round(paidPercent(record))} size="small" style={{ minWidth: 120 }} />
              )
            },
            {
              title: t('Statut'),
              dataIndex: 'status',
              render: (value: PropertyLoan['status']) => <Tag>{loanStatusLabel(value)}</Tag>
            },
            {
              title: t('Actions'),
              key: 'actions',
              render: (_: unknown, record: PropertyLoan) => (
                <Space>
                  <Button size="small" onClick={() => onEdit(record)}>
                    {t('Modifier')}
                  </Button>
                  <Popconfirm title={t('Supprimer ce crédit ?')} onConfirm={() => onDelete(record.id)}>
                    <Button size="small" danger loading={busyActionId === `loan-${record.id}`}>
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
