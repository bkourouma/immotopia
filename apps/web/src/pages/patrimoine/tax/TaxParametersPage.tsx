import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Select, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { getTaxParameters } from '../../../services/patrimoine-entities-service';
import type { TaxParametersData } from '../../../types/patrimoine-entities-types';
import { useAuth } from '../../../hooks/useAuth';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { PageHeader, StateBlock, SkeletonTable, Table } from '../../../components/primitives';
import {
  fiscalCountryOptions,
  occupancySelectorLabel,
  ownerKindSelectorLabel,
  parameterKeyLabel,
  parameterStatusLabel,
  propertyKindSelectorLabel,
  taxKindLabel
} from '../../../components/patrimoine/entities/tax-labels';
import { TaxDisclaimer } from '../../../components/patrimoine/entities/TaxDisclaimer';
import { localizedList } from '../../../i18n/localized';
import { t } from '../../../i18n/t';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';

const { Text } = Typography;

type ParameterRow = TaxParametersData['parameters'][number];

const OPTIONS_IMPOT = localizedList(() =>
  (['PROPERTY_TAX', 'RENTAL_INCOME_TAX'] as const).map(kind => ({ value: kind, label: taxKindLabel(kind) }))
);
const OPTIONS_STATUT = localizedList(() =>
  (['VALIDE', 'A_VALIDER'] as const).map(status => ({ value: status, label: parameterStatusLabel(status) }))
);

// Accesseurs stables (hors composant). Champ libre : impôt, clé et libellé tels qu'affichés, bien, source, notes.
const TEXTE_RECHERCHE = [
  (p: ParameterRow) => taxKindLabel(p.taxKind),
  (p: ParameterRow) => p.key,
  (p: ParameterRow) => parameterKeyLabel(p.key, p.label),
  (p: ParameterRow) => p.label,
  (p: ParameterRow) => propertyKindSelectorLabel(p.propertyKind),
  (p: ParameterRow) => p.source,
  (p: ParameterRow) => p.notes
];
const ACCESSEURS = {
  impot: (p: ParameterRow) => p.taxKind,
  statut: (p: ParameterRow) => p.status
};

/**
 * `<TaxParametersPage>` — référentiel fiscal versionné (impôt, clé, sélecteurs,
 * valeur, source, statut) par pays et par année.
 */
export const TaxParametersPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const agence = tenantId || tenantMembership?.tenantId;

  const [country, setCountry] = useState<'CI' | 'ML'>('CI');
  const [year, setYear] = useState<number | undefined>(undefined);

  const parametersQuery = useQuery({
    queryKey: queryKey('tax-parameters', agence, { country, year }),
    queryFn: () => getTaxParameters(agence as string, { country, year }),
    enabled: Boolean(agence),
    staleTime: STALE_TIME.reference
  });

  const parameters = useMemo(() => parametersQuery.data?.parameters ?? [], [parametersQuery.data]);
  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Impôt, clé, libellé, bien, source…') },
    { key: 'impot', type: 'multiSelect', label: t('Impôt'), primary: true, options: OPTIONS_IMPOT },
    { key: 'statut', type: 'multiSelect', label: t('Statut'), options: OPTIONS_STATUT }
  ];
  const local = useLocalListSearch<ParameterRow>(parameters, {
    ariaLabel: t('Rechercher dans les paramètres'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  const columns: ColumnsType<ParameterRow> = [
    {
      title: t('Impôt'),
      dataIndex: 'taxKind',
      key: 'taxKind',
      render: (value: ParameterRow['taxKind']) => taxKindLabel(value)
    },
    {
      title: t('Clé'),
      dataIndex: 'key',
      key: 'key',
      render: (value: string, row) => parameterKeyLabel(value, row.label)
    },
    {
      title: t('Bien'),
      dataIndex: 'propertyKind',
      key: 'propertyKind',
      render: (value: ParameterRow['propertyKind']) => propertyKindSelectorLabel(value)
    },
    {
      title: t('Occupation'),
      dataIndex: 'occupancy',
      key: 'occupancy',
      render: (value: ParameterRow['occupancy']) => occupancySelectorLabel(value)
    },
    {
      title: t('Propriétaire'),
      dataIndex: 'ownerKind',
      key: 'ownerKind',
      render: (value: ParameterRow['ownerKind']) => ownerKindSelectorLabel(value)
    },
    {
      title: t('Valeur'),
      key: 'value',
      render: (_: unknown, row: ParameterRow) => (
        <span>
          {row.value ?? row.valueText ?? '—'} {row.unit === 'PERCENT' ? '%' : row.unit === 'YEARS' ? t('an(s)') : ''}
        </span>
      )
    },
    { title: t('Libellé'), dataIndex: 'label', key: 'label' },
    {
      title: t('Source'),
      key: 'source',
      exportValue: (row: ParameterRow) =>
        row.sourceUrl && row.sourceUrl.startsWith('https://') ? `${row.source} — ${row.sourceUrl}` : row.source,
      render: (_: unknown, row: ParameterRow) => (
        <span>
          {row.source}
          {row.sourceUrl && row.sourceUrl.startsWith('https://') && (
            <>
              {' '}
              <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">
                {t('Voir la source')}
              </a>
            </>
          )}
        </span>
      )
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (value: ParameterRow['status']) => (
        <Tag color={value === 'VALIDE' ? 'success' : 'warning'}>{parameterStatusLabel(value)}</Tag>
      )
    },
    { title: t('Notes'), dataIndex: 'notes', key: 'notes', render: (value: string | null) => value ?? '—' }
  ];

  if (!agence) {
    return <StateBlock variant="empty" title={t('Aucune agence sélectionnée')} />;
  }

  return (
    <>
      <PageHeader
        title={t('Paramètres fiscaux')}
        subtitle={t('Référentiel CI/ML utilisé par le moteur fiscal')}
        extra={
          <>
            <Select value={country} style={{ width: 160 }} options={fiscalCountryOptions()} onChange={setCountry} />
            <Select
              allowClear
              placeholder={t('Année')}
              style={{ width: 120, marginInlineStart: 'var(--space-2)' }}
              value={year}
              onChange={setYear}
              options={(parametersQuery.data?.countries.find(c => c.country === country)?.years ?? []).map(y => ({
                value: y,
                label: y
              }))}
              aria-label={t('Année')}
            />
          </>
        }
      />

      <TaxDisclaimer />

      {parametersQuery.data?.fallback && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
          {t("Aucun paramètre pour l'année demandée : affichage des paramètres {{annee}}.", {
            annee: parametersQuery.data.parametersYear ?? '—'
          })}
        </Text>
      )}

      {parametersQuery.error ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger les paramètres fiscaux.')}
          actions={[{ label: t('Réessayer'), onClick: () => parametersQuery.refetch(), primary: true }]}
        />
      ) : parametersQuery.isPending ? (
        <SkeletonTable rows={8} columns={columns.length} aria-label={t('Paramètres en cours de chargement')} />
      ) : (
        <Table
          {...local.tableProps}
          exportFilename={t('Paramètres fiscaux')}
          exportFetchAll={local.exportAll}
          rowKey="id"
          columns={columns}
          size="middle"
          aria-label={t('Paramètres fiscaux')}
          locale={local.isFiltered ? undefined : { emptyText: t('Aucun paramètre pour ce pays et cette année') }}
        />
      )}
    </>
  );
};
