import React, { useMemo } from 'react';
import { Button, Collapse, Select, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { DataCard, DataView, MoneyValue, Table } from '../../primitives';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import { useFormFieldModes } from '../../../hooks/useFormFieldModes';
import { LinkedProviderInvoices } from '../LinkedProviderInvoices';
import type { Property } from '../../../types/property-types';
import type { ServiceProvider, SyndicateIncident, SyndicateLot } from '../../../types/syndic-types';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { dateFormat } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import {
  getImputationTypeLabel,
  getIncidentStatusLabel,
  getIncidentTypeLabel,
  getIncidentUrgencyLabel,
  getLotDisplayName,
  getLotOptionLabel,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  INCIDENT_URGENCIES,
  incidentStatusColors
} from './profile-labels';

/** Couleur du tag d'urgence : le texte reste affiché, la couleur n'est qu'un repère. */
const urgencyColors: Record<string, string> = {
  LOW: 'default',
  MEDIUM: 'gold',
  HIGH: 'orange',
  CRITICAL: 'red'
};

/** Incident enrichi des champs que lisent le tableau et la recherche. */
interface IncidentRow extends SyndicateIncident {
  lotLabel: string;
  lotNumber: string;
  lotReference: string;
  providerName: string;
  imputationCount: number;
}

// Accesseurs stables (hors du composant) : le filtrage reste mémoïsé. Les
// libellés de type, d'urgence et de statut sont lus dans la fonction (langue
// courante) et cherchés tels qu'affichés.
const TEXTE_RECHERCHE = [
  (row: IncidentRow) => row.description,
  (row: IncidentRow) => row.lotNumber,
  (row: IncidentRow) => row.lotLabel,
  (row: IncidentRow) => row.lotReference,
  (row: IncidentRow) => row.providerName,
  (row: IncidentRow) => getIncidentTypeLabel(row.incidentType),
  (row: IncidentRow) => getIncidentUrgencyLabel(row.urgency),
  (row: IncidentRow) => getIncidentStatusLabel(row.status)
];
const ACCESSEURS = {
  status: (row: IncidentRow) => row.status,
  urgency: (row: IncidentRow) => row.urgency,
  provider: (row: IncidentRow) => row.providerId,
  type: (row: IncidentRow) => row.incidentType,
  lot: (row: IncidentRow) => row.lotId,
  reported: (row: IncidentRow) => row.reportedAt,
  imputed: (row: IncidentRow) => row.imputationCount > 0
};

interface IncidentsTabProps {
  tenantId: string;
  syndicId: string;
  items: SyndicateIncident[];
  loading: boolean;
  lots: SyndicateLot[];
  lotsById: Record<string, SyndicateLot>;
  propertiesByInternalReference: Record<string, Property>;
  providers: ServiceProvider[];
  assigningProviderIncidentId: string | null;
  onAssignProvider: (incidentId: string, providerId: string | undefined) => void;
  onEdit: (incident: SyndicateIncident) => void;
  onAddImputation: (incident: SyndicateIncident) => void;
  /** Proposition affichée quand la copropriété n'a encore aucun incident. */
  onCreate?: () => void;
}

/**
 * Onglet « Incidents et imputations » : liste reçue en entier, recherche et
 * pagination locales (préfixe d'URL « in »). Le tableau des imputations d'un
 * incident déplié est un détail (quelques lignes) : pas de barre de recherche.
 */
export const IncidentsTab: React.FC<IncidentsTabProps> = ({
  tenantId,
  syndicId,
  items,
  loading,
  lots,
  lotsById,
  propertiesByInternalReference,
  providers,
  assigningProviderIncidentId,
  onAssignProvider,
  onEdit,
  onAddImputation,
  onCreate
}) => {
  const { isDesktop } = useBreakpoint();
  const providerFm = useFormFieldModes('syndic.incident-modification');
  const providersById = useMemo(() => new Map(providers.map(provider => [provider.id, provider])), [providers]);

  const rows = useMemo<IncidentRow[]>(
    () =>
      items.map(incident => {
        const lot = incident.lotId ? lotsById[incident.lotId] : undefined;
        const lotReference = lot?.property?.internalReference || lot?.lotNumber || '';
        const propertyByReference = lotReference
          ? propertiesByInternalReference[lotReference.trim().toUpperCase()]
          : undefined;
        return {
          ...incident,
          lotLabel: lot ? getLotDisplayName(lot, propertyByReference) : '',
          lotNumber: lot?.lotNumber || '',
          lotReference: lot?.property?.internalReference || '',
          providerName: (incident.providerId ? providersById.get(incident.providerId)?.name : undefined) ?? '',
          imputationCount: incident.imputations?.length || 0
        };
      }),
    [items, lotsById, propertiesByInternalReference, providersById]
  );

  const lotOptions = useMemo(
    () => lots.map(lot => ({ value: lot.id, label: getLotOptionLabel(lot, propertiesByInternalReference) })),
    [lots, propertiesByInternalReference]
  );
  const providerOptions = useMemo(
    () => providers.map(provider => ({ value: provider.id, label: provider.name })),
    [providers]
  );

  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Description, lot, prestataire…')
    },
    {
      key: 'status',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: INCIDENT_STATUSES.map(value => ({ value, label: getIncidentStatusLabel(value) }))
    },
    {
      key: 'urgency',
      type: 'multiSelect',
      label: t('Urgence'),
      primary: true,
      options: INCIDENT_URGENCIES.map(value => ({ value, label: getIncidentUrgencyLabel(value) }))
    },
    { key: 'provider', type: 'select', label: t('Prestataire'), primary: true, options: providerOptions },
    {
      key: 'type',
      type: 'multiSelect',
      label: t('Type'),
      options: INCIDENT_TYPES.map(value => ({ value, label: getIncidentTypeLabel(value) }))
    },
    { key: 'lot', type: 'select', label: t('Lot'), options: lotOptions },
    { key: 'reported', type: 'dateRange', label: t('Signalé le') },
    {
      key: 'imputed',
      type: 'boolean',
      label: t('Imputations'),
      tristate: true,
      trueLabel: t('Avec imputation'),
      falseLabel: t('Sans imputation')
    }
  ];

  const local = useLocalListSearch<IncidentRow>(rows, {
    paramPrefix: 'in',
    ariaLabel: t('Rechercher dans les incidents'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  const columns: ColumnsType<IncidentRow> = [
    {
      title: t('Lot'),
      key: 'lot',
      render: (_: unknown, incident: IncidentRow) => incident.lotNumber || '-'
    },
    {
      title: t('Type'),
      dataIndex: 'incidentType',
      width: 100,
      render: (value: string) => getIncidentTypeLabel(value)
    },
    {
      title: t('Urgence'),
      dataIndex: 'urgency',
      width: 90,
      render: (value: string) => <Tag color={urgencyColors[value] || 'default'}>{getIncidentUrgencyLabel(value)}</Tag>
    },
    {
      title: t('Description'),
      dataIndex: 'description',
      // Texte complet, retourné à la ligne : sans largeur fixe, le
      // tableau l'étalerait sur une seule ligne. 240 px laissent
      // Statut, Prestataire et Actions visibles sans défilement
      // horizontal sur un écran de portable.
      width: 240,
      render: (value: string) => <div style={{ width: 240, maxWidth: '100%', whiteSpace: 'normal' }}>{value}</div>
    },
    {
      title: t('Signalé le'),
      dataIndex: 'reportedAt',
      width: 110,
      render: (value?: string) => (value ? dayjs(value).format(dateFormat('short')) : '-')
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      width: 110,
      render: (value: string) => (
        <Tag color={incidentStatusColors[value] || 'default'}>{getIncidentStatusLabel(value)}</Tag>
      )
    },
    {
      title: t('Imputations'),
      width: 100,
      render: (_, row) => <Tag color={row.imputationCount > 0 ? 'blue' : 'default'}>{row.imputationCount}</Tag>
    },
    {
      title: t('Prestataire'),
      key: 'providerId',
      width: 200,
      // Le rendu est un sélecteur : on exporte le nom du prestataire assigné.
      exportValue: (row: IncidentRow) => row.providerName,
      render: (_, row) =>
        // Champ masqué par l'agence : le prestataire reste affiché mais n'est plus modifiable ici.
        !providerFm.isVisible('providerId') ? (
          <Typography.Text>{row.providerName || '—'}</Typography.Text>
        ) : (
          <Select
            allowClear={!providerFm.isRequired('providerId', false)}
            showSearch
            style={{ minWidth: 180 }}
            placeholder={t('Aucun prestataire')}
            optionFilterProp="label"
            value={row.providerId || undefined}
            loading={assigningProviderIncidentId === row.id}
            disabled={assigningProviderIncidentId === row.id}
            options={providerOptions}
            onChange={value => onAssignProvider(row.id, value)}
          />
        )
    },
    {
      title: t('Actions'),
      key: 'actions',
      fixed: 'right',
      width: 220,
      render: (_, row) => (
        <Space wrap>
          <Button
            size="small"
            icon={<EditOutlined />}
            aria-label={t("Modifier l'incident du lot {{lot}}", { lot: row.lotNumber || '-' })}
            onClick={() => onEdit(row)}
          >
            {t("Modifier l'incident")}
          </Button>
          <Button
            size="small"
            aria-label={t("Ajouter une imputation à l'incident du lot {{lot}}", { lot: row.lotNumber || '-' })}
            onClick={() => onAddImputation(row)}
          >
            {t('Ajouter imputation')}
          </Button>
        </Space>
      )
    }
  ];

  /** Détail d'un incident : imputations et factures liées (ligne dépliée, ou volet de la carte). */
  const renderDetail = (incident: IncidentRow) => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Table
        helpId="syndic.profils.imputations"
        // Sous-tableau d'une ligne dépliée : pas d'export propre.
        exportable={false}
        scroll={{ x: 'max-content' }}
        rowKey="id"
        dataSource={incident.imputations || []}
        pagination={false}
        size="small"
        locale={{ emptyText: t('Aucune imputation pour cet incident.') }}
        columns={[
          {
            title: t('Type'),
            dataIndex: 'imputationType',
            render: (value: string) => getImputationTypeLabel(value)
          },
          {
            title: t('Montant'),
            dataIndex: 'amount',
            align: 'end',
            render: (value: number | string) => <MoneyValue value={value} />
          },
          {
            title: t('Lot'),
            render: (_, row) => {
              const lot = row.lot || (row.lotId ? lotsById[row.lotId] : undefined);
              const lotReference = lot?.property?.internalReference || lot?.lotNumber || '';
              const propertyByReference = lotReference
                ? propertiesByInternalReference[lotReference.trim().toUpperCase()]
                : undefined;
              return getLotDisplayName(lot, propertyByReference);
            }
          },
          {
            title: t('Notes'),
            dataIndex: 'notes',
            render: (value: string | undefined | null) => value || '-'
          },
          {
            title: t('Créé le'),
            dataIndex: 'createdAt',
            render: (value: string) => dayjs(value).format(dateFormat('dateTime'))
          }
        ]}
      />
      <div>
        <Typography.Text strong>{t('Factures liées')}</Typography.Text>
        <LinkedProviderInvoices tenantId={tenantId} syndicId={syndicId} incidentId={incident.id} />
      </div>
    </Space>
  );

  // Sous 992 px : cartes (le tableau et sa ligne dépliable ne tiennent pas sur téléphone).
  if (!isDesktop) {
    return (
      <DataView<IncidentRow>
        {...local.dataViewProps}
        helpId="syndic.profils.incidents"
        aria-label={t('Incidents et imputations')}
        export={{ filename: t('Incidents et imputations'), fetchAll: local.exportAll }}
        rowKey={row => row.id}
        loading={loading}
        columns={columns}
        emptyDescription={t('Aucun incident pour cette copropriété.')}
        emptyAction={onCreate ? { label: t('Nouvel incident'), onClick: onCreate } : undefined}
        renderCard={row => (
          <DataCard
            title={`${getIncidentTypeLabel(row.incidentType)}${row.lotNumber ? ` · ${row.lotNumber}` : ''}`}
            subtitle={row.description}
            status={
              <Tag color={incidentStatusColors[row.status] || 'default'}>{getIncidentStatusLabel(row.status)}</Tag>
            }
            fields={[
              {
                label: t('Urgence'),
                value: <Tag color={urgencyColors[row.urgency] || 'default'}>{getIncidentUrgencyLabel(row.urgency)}</Tag>
              },
              {
                label: t('Signalé le'),
                value: row.reportedAt ? dayjs(row.reportedAt).format(dateFormat('short')) : '-'
              },
              { label: t('Imputations'), value: row.imputationCount },
              {
                label: t('Prestataire'),
                value: !providerFm.isVisible('providerId') ? (
                  row.providerName || '—'
                ) : (
                  <Select
                    allowClear={!providerFm.isRequired('providerId', false)}
                    showSearch
                    style={{ width: '100%', minHeight: 44 }}
                    placeholder={t('Aucun prestataire')}
                    optionFilterProp="label"
                    value={row.providerId || undefined}
                    loading={assigningProviderIncidentId === row.id}
                    disabled={assigningProviderIncidentId === row.id}
                    options={providerOptions}
                    onChange={value => onAssignProvider(row.id, value)}
                  />
                )
              },
              {
                label: t('Détail'),
                value: (
                  <Collapse
                    ghost
                    size="small"
                    destroyOnHidden
                    items={[{ key: 'detail', label: t('Imputations et factures liées'), children: renderDetail(row) }]}
                  />
                )
              }
            ]}
            primaryAction={{ label: t("Modifier l'incident"), onClick: () => onEdit(row) }}
            secondaryActions={[{ key: 'impute', label: t('Ajouter imputation'), onClick: () => onAddImputation(row) }]}
          />
        )}
      />
    );
  }

  return (
    <Table<IncidentRow>
      {...local.tableProps}
      helpId="syndic.profils.incidents"
      exportFilename={t('Incidents et imputations')}
      exportFetchAll={local.exportAll}
      scroll={{ x: 1100 }}
      rowKey="id"
      loading={loading}
      columns={columns}
      locale={local.isFiltered ? undefined : { emptyText: t('Aucun incident pour cette copropriété.') }}
      expandable={{
        expandedRowRender: renderDetail,
        rowExpandable: () => true
      }}
    />
  );
};
