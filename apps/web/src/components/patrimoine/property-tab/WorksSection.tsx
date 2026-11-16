import React from 'react';
import { Alert, Button, Card, Popconfirm, Space, Tag } from 'antd';
import { MoneyValue, Table } from '../../primitives';
import type { WorkProgram, WorkProgramStatus } from '../../../types/patrimoine-types';
import { t } from '../../../i18n/t';
import { activeLocale } from '../../../i18n/format';
import { localizedList } from '../../../i18n/localized';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { DEVISE_PATRIMOINE } from '../patrimoine-labels';

export function workProgramStatusLabel(status: WorkProgram['status']): string {
  if (status === 'PLANNED') return t('Planifié');
  if (status === 'IN_PROGRESS') return t('En cours');
  if (status === 'COMPLETED') return t('Terminé');
  if (status === 'CANCELLED') return t('Annulé');
  return status;
}

const STATUTS: readonly WorkProgramStatus[] = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const OPTIONS_STATUT = localizedList(() =>
  STATUTS.map(status => ({ value: status, label: workProgramStatusLabel(status) }))
);

// Accesseurs stables (hors composant). Champ libre : titre, description, chantier rattaché, statut affiché.
const TEXTE_RECHERCHE = [
  (w: WorkProgram) => w.title,
  (w: WorkProgram) => w.description,
  (w: WorkProgram) => w.constructionSite?.name,
  (w: WorkProgram) => workProgramStatusLabel(w.status)
];
const ACCESSEURS = {
  statut: (w: WorkProgram) => w.status,
  date: (w: WorkProgram) => w.plannedDate,
  cout: (w: WorkProgram) => w.estimatedCost
};

interface Props {
  workPrograms: WorkProgram[];
  error?: string;
  busyActionId: string | null;
  onAdd: () => void;
  onEdit: (item: WorkProgram) => void;
  onDelete: (id: string) => void;
}

/** Tableau de gestion des travaux (la frise est posée au-dessus par l'onglet) : recherche locale `trv.*`. */
export const WorksSection: React.FC<Props> = ({ workPrograms, error, busyActionId, onAdd, onEdit, onDelete }) => {
  const criteres: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Titre, description, chantier…') },
    { key: 'statut', type: 'multiSelect', label: t('Statut'), primary: true, options: OPTIONS_STATUT },
    { key: 'date', type: 'dateRange', label: t('Date prévue'), primary: true },
    { key: 'cout', type: 'numberRange', label: t('Coût estimé'), unit: DEVISE_PATRIMOINE }
  ];
  const local = useLocalListSearch<WorkProgram>(workPrograms, {
    paramPrefix: 'trv',
    ariaLabel: t('Rechercher dans les travaux'),
    defaultPageSize: 10,
    criteria: criteres,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  return (
    <Card
      title={t('Gérer les programmes de travaux')}
      extra={
        <Button type="primary" onClick={onAdd}>
          {t('Ajouter')}
        </Button>
      }
    >
      {error ? (
        <Alert type="error" showIcon message={error} />
      ) : (
        <Table<WorkProgram>
          helpId="patrimoine.bien.travaux"
          {...local.tableProps}
          exportFilename={t('Gérer les programmes de travaux')}
          exportFetchAll={local.exportAll}
          scroll={{ x: 'max-content' }}
          rowKey="id"
          locale={local.isFiltered ? undefined : { emptyText: t('Aucun programme de travaux pour ce bien.') }}
          columns={[
            { title: t('Titre'), dataIndex: 'title' },
            {
              title: t('Chantier'),
              dataIndex: 'constructionSite',
              exportValue: (record: WorkProgram) => record.constructionSite?.name ?? '',
              render: (_: unknown, record: WorkProgram) =>
                record.constructionSite ? <Tag color="blue">{record.constructionSite.name}</Tag> : '—'
            },
            {
              title: t('Date prévue'),
              dataIndex: 'plannedDate',
              render: (value: string) => new Date(value).toLocaleDateString(activeLocale())
            },
            {
              title: t('Coût estimé'),
              dataIndex: 'estimatedCost',
              render: (value: number, record: WorkProgram) => <MoneyValue value={value} currency={record.currency} />
            },
            {
              title: t('Coût réel'),
              dataIndex: 'actualCost',
              render: (value: number | null | undefined, record: WorkProgram) => (
                <MoneyValue value={value ?? null} currency={record.currency} />
              )
            },
            {
              title: t('Statut'),
              dataIndex: 'status',
              render: (value: WorkProgram['status']) => <Tag>{workProgramStatusLabel(value)}</Tag>
            },
            {
              title: t('Actions'),
              key: 'actions',
              render: (_: unknown, record: WorkProgram) => (
                <Space>
                  <Button size="small" onClick={() => onEdit(record)}>
                    {t('Modifier')}
                  </Button>
                  <Popconfirm title={t('Supprimer ce programme ?')} onConfirm={() => onDelete(record.id)}>
                    <Button size="small" danger loading={busyActionId === `work-${record.id}`}>
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
