import React, { useMemo } from 'react';
import { Button, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView } from '../../primitives';
import type { Property } from '../../../types/property-types';
import type { LotTenantProfile, SyndicateLot } from '../../../types/syndic-types';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { dateFormat } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { getLotDisplayName, getLotOptionLabel, isTenantProfileCurrent, profileContactName } from './profile-labels';

/** Profil locataire enrichi des champs que lisent le tableau et la recherche. */
interface TenantRow extends LotTenantProfile {
  lotLabel: string;
  lotNumber: string;
  contactName: string;
  /** `current` : profil actuel (sortie vide ou à venir) ; `former` : terminé. */
  situation: 'current' | 'former';
}

// Accesseurs stables (hors du composant) : le filtrage reste mémoïsé.
const TEXTE_RECHERCHE = [
  (row: TenantRow) => row.contactName,
  (row: TenantRow) => row.contact?.firstName,
  (row: TenantRow) => row.contact?.lastName,
  (row: TenantRow) => row.contact?.legalName,
  (row: TenantRow) => row.contact?.email,
  (row: TenantRow) => row.contact?.phone,
  (row: TenantRow) => row.lotNumber,
  (row: TenantRow) => row.lotLabel
];
const ACCESSEURS = {
  lot: (row: TenantRow) => row.lotId,
  situation: (row: TenantRow) => row.situation,
  billed: (row: TenantRow) => row.chargesBilledToTenant
};

interface TenantProfilesTabProps {
  items: LotTenantProfile[];
  loading: boolean;
  lots: SyndicateLot[];
  lotsById: Record<string, SyndicateLot>;
  propertiesByInternalReference: Record<string, Property>;
  endingTenantProfileId: string | null;
  onEnd: (profile: LotTenantProfile) => void;
  /** Proposition affichée quand la copropriété n'a encore aucun profil locataire. */
  onCreate?: () => void;
}

/**
 * Onglet « Profils locataires » : liste reçue en entier, recherche et
 * pagination locales (préfixe d'URL « pl »).
 */
export const TenantProfilesTab: React.FC<TenantProfilesTabProps> = ({
  items,
  loading,
  lots,
  lotsById,
  propertiesByInternalReference,
  endingTenantProfileId,
  onEnd,
  onCreate
}) => {
  const rows = useMemo<TenantRow[]>(
    () =>
      items.map(profile => {
        const lot = profile.lot || (profile.lotId ? lotsById[profile.lotId] : undefined);
        const lotReference = lot?.property?.internalReference || lot?.lotNumber || '';
        const propertyByReference = lotReference
          ? propertiesByInternalReference[lotReference.trim().toUpperCase()]
          : undefined;
        return {
          ...profile,
          lotLabel: getLotDisplayName(lot, propertyByReference),
          lotNumber: lot?.lotNumber || '',
          contactName: profileContactName(profile.contact, profile.contactId),
          situation: isTenantProfileCurrent(profile) ? 'current' : 'former'
        };
      }),
    [items, lotsById, propertiesByInternalReference]
  );

  const lotOptions = useMemo(
    () => lots.map(lot => ({ value: lot.id, label: getLotOptionLabel(lot, propertiesByInternalReference) })),
    [lots, propertiesByInternalReference]
  );

  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Nom, e-mail, téléphone, lot…')
    },
    { key: 'lot', type: 'select', label: t('Lot'), primary: true, options: lotOptions },
    {
      key: 'situation',
      type: 'select',
      label: t('Statut'),
      primary: true,
      options: [
        { value: 'current', label: t('Actuel') },
        { value: 'former', label: t('Terminé') }
      ]
    },
    {
      key: 'billed',
      type: 'boolean',
      label: t('Facture au locataire'),
      tristate: true,
      trueLabel: t('Oui'),
      falseLabel: t('Non')
    }
  ];

  const local = useLocalListSearch<TenantRow>(rows, {
    paramPrefix: 'pl',
    ariaLabel: t('Rechercher dans les profils locataires'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  const columns: ColumnsType<TenantRow> = [
    { title: t('Lot'), render: (_, row) => row.lotLabel },
    { title: t('Contact'), render: (_, row) => row.contactName },
    {
      title: t('Depuis'),
      dataIndex: 'tenantSince',
      render: (value: string) => dayjs(value).format(dateFormat('short'))
    },
    {
      title: t('Facture au locataire'),
      render: (_, row) => (row.chargesBilledToTenant ? t('Oui') : t('Non'))
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_, row) =>
        row.situation === 'current' ? <Tag color="green">{t('Actuel')}</Tag> : <Tag>{t('Terminé')}</Tag>
    },
    {
      title: t('Actions'),
      key: 'tenant-actions',
      exportable: false,
      render: (_, row) =>
        row.situation === 'current' ? (
          <Button size="small" loading={endingTenantProfileId === row.id} onClick={() => onEnd(row)}>
            {t('Terminer')}
          </Button>
        ) : null
    }
  ];

  return (
    <DataView<TenantRow>
      {...local.dataViewProps}
      helpId="syndic.profils.locataires"
      aria-label={t('Profils locataires')}
      export={{ filename: t('Profils locataires'), fetchAll: local.exportAll }}
      rowKey={row => row.id}
      loading={loading}
      columns={columns}
      scrollX={760}
      emptyDescription={t('Aucun profil locataire pour cette copropriété.')}
      emptyAction={onCreate ? { label: t('Profil locataire'), onClick: onCreate } : undefined}
      renderCard={row => (
        <DataCard
          title={row.contactName}
          subtitle={row.lotLabel}
          status={row.situation === 'current' ? <Tag color="green">{t('Actuel')}</Tag> : <Tag>{t('Terminé')}</Tag>}
          fields={[
            { label: t('Depuis'), value: dayjs(row.tenantSince).format(dateFormat('short')) },
            { label: t('Facture au locataire'), value: row.chargesBilledToTenant ? t('Oui') : t('Non') }
          ]}
          primaryAction={
            row.situation === 'current'
              ? { label: t('Terminer'), onClick: () => onEnd(row), loading: endingTenantProfileId === row.id }
              : undefined
          }
        />
      )}
    />
  );
};
