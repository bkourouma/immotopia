import React from 'react';
import { Button, Card, Space, Tag } from 'antd';
import { ConfirmAction, MoneyValue, Table } from '../../primitives';
import { SectionEmpty, SectionError, SUPPRESSION_DEFINITIVE } from './section-parts';
import type { AssetValuation } from '../../../types/patrimoine-types';
import { t } from '../../../i18n/t';
import { activeLocale } from '../../../i18n/format';
import { localizedList } from '../../../i18n/localized';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { DEVISE_PATRIMOINE, valuationMethodLabel } from '../patrimoine-labels';

const OPTIONS_METHODE = localizedList(() =>
  (['MANUAL', 'MARKET_ESTIMATE', 'EXPERT_APPRAISAL'] as const).map(method => ({
    value: method,
    label: valuationMethodLabel(method)
  }))
);

// Accesseurs stables (hors composant) : le filtrage reste mémoïsé.
// Champ libre : notes et méthode telle qu'affichée (libellé lu au moment de la recherche).
const TEXTE_RECHERCHE = [(v: AssetValuation) => v.notes, (v: AssetValuation) => valuationMethodLabel(v.method)];
const ACCESSEURS = {
  methode: (v: AssetValuation) => v.method,
  date: (v: AssetValuation) => v.valuatedAt,
  valeur: (v: AssetValuation) => v.estimatedValue
};

interface Props {
  valuations: AssetValuation[];
  error?: string;
  /** Relance le chargement de la rubrique (bouton « Réessayer » de l'état d'erreur). */
  onRetry?: () => void;
  busyActionId: string | null;
  onAdd: () => void;
  onEdit: (item: AssetValuation) => void;
  onDelete: (id: string) => void;
}

/** Rubrique « Valorisations » : tableau de gestion, recherche locale `val.*`, pages de 10. */
export const ValuationsSection: React.FC<Props> = ({
  valuations,
  error,
  onRetry,
  busyActionId,
  onAdd,
  onEdit,
  onDelete
}) => {
  const criteres: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Notes, méthode…') },
    { key: 'methode', type: 'multiSelect', label: t('Méthode'), primary: true, options: OPTIONS_METHODE },
    { key: 'date', type: 'dateRange', label: t('Date'), primary: true },
    { key: 'valeur', type: 'numberRange', label: t('Valeur'), unit: DEVISE_PATRIMOINE }
  ];
  const local = useLocalListSearch<AssetValuation>(valuations, {
    paramPrefix: 'val',
    ariaLabel: t('Rechercher dans les valorisations'),
    defaultPageSize: 10,
    criteria: criteres,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  return (
    <Card
      title={t('Gérer les valorisations')}
      extra={
        <Button type="primary" onClick={onAdd}>
          {t('Ajouter')}
        </Button>
      }
    >
      {error ? (
        <SectionError title={t('Impossible de charger les valorisations')} detail={error} onRetry={onRetry} />
      ) : (
        <Table<AssetValuation>
          helpId="patrimoine.bien.valorisations"
          {...local.tableProps}
          exportFilename={t('Gérer les valorisations')}
          exportFetchAll={local.exportAll}
          scroll={{ x: 'max-content' }}
          rowKey="id"
          locale={{
            emptyText: local.isFiltered ? undefined : (
              <SectionEmpty
                title={t('Aucune valorisation pour ce bien.')}
                addLabel={t('Ajouter une valorisation')}
                onAdd={onAdd}
              />
            )
          }}
          columns={[
            {
              title: t('Date'),
              dataIndex: 'valuatedAt',
              render: (value: string) => new Date(value).toLocaleString(activeLocale())
            },
            {
              title: t('Valeur'),
              dataIndex: 'estimatedValue',
              render: (value: number, record: AssetValuation) => <MoneyValue value={value} currency={record.currency} />
            },
            {
              title: t('Méthode'),
              dataIndex: 'method',
              render: (value: AssetValuation['method']) => <Tag>{valuationMethodLabel(value)}</Tag>
            },
            {
              title: t('Actions'),
              key: 'actions',
              render: (_: unknown, record: AssetValuation) => (
                <Space wrap>
                  <Button size="small" onClick={() => onEdit(record)}>
                    {t('Modifier')}
                  </Button>
                  <ConfirmAction
                    danger
                    okText={t('Supprimer')}
                    title={t('Supprimer la valorisation du {{date}} ?', {
                      date: new Date(record.valuatedAt).toLocaleDateString(activeLocale())
                    })}
                    description={SUPPRESSION_DEFINITIVE()}
                    onConfirm={() => onDelete(record.id)}
                  >
                    <Button size="small" danger loading={busyActionId === `valuation-${record.id}`}>
                      {t('Supprimer')}
                    </Button>
                  </ConfirmAction>
                </Space>
              )
            }
          ]}
        />
      )}
    </Card>
  );
};
