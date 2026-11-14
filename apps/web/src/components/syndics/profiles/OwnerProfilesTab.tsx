import React, { useMemo } from 'react';
import { Alert, Button, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Table } from '../../primitives';
import type { Property } from '../../../types/property-types';
import type { IncompleteOwnerShares, LotOwnerProfile, SyndicateLot } from '../../../types/syndic-types';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { dateFormat } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { getLotDisplayName, getLotOptionLabel, profileContactName } from './profile-labels';

/** Profil propriétaire enrichi des champs que lisent le tableau et la recherche. */
interface OwnerRow extends LotOwnerProfile {
  lotLabel: string;
  lotNumber: string;
  contactName: string;
  /** `current` : profil actif et non clos ; `former` : clos ou désactivé. */
  situation: 'current' | 'former';
  incompleteShare: boolean;
}

// Accesseurs stables (hors du composant) : le filtrage reste mémoïsé.
const TEXTE_RECHERCHE = [
  (row: OwnerRow) => row.contactName,
  (row: OwnerRow) => row.contact?.firstName,
  (row: OwnerRow) => row.contact?.lastName,
  (row: OwnerRow) => row.contact?.legalName,
  (row: OwnerRow) => row.contact?.email,
  (row: OwnerRow) => row.contact?.phone,
  (row: OwnerRow) => row.lotNumber,
  (row: OwnerRow) => row.lotLabel
];
const ACCESSEURS = {
  lot: (row: OwnerRow) => row.lotId,
  situation: (row: OwnerRow) => row.situation,
  portal: (row: OwnerRow) => row.portalAccessEnabled,
  incomplete: (row: OwnerRow) => row.incompleteShare
};

interface OwnerProfilesTabProps {
  items: LotOwnerProfile[];
  /** Lots dont les parts totalisent moins de 100 % (calculé par l'API sur tous les profils). */
  incompleteShares: IncompleteOwnerShares[];
  loading: boolean;
  lots: SyndicateLot[];
  lotsById: Record<string, SyndicateLot>;
  propertiesByInternalReference: Record<string, Property>;
  invitingProfileId: string | null;
  revokingProfileId: string | null;
  onInvite: (profile: LotOwnerProfile) => void;
  onRevoke: (profile: LotOwnerProfile) => void;
}

/** Un profil propriétaire est « actuel » s'il est actif et que sa fin est vide ou à venir. */
function isOwnerCurrent(profile: LotOwnerProfile): boolean {
  if (profile.isActive === false) return false;
  return !profile.ownedUntil || dayjs(profile.ownedUntil).isAfter(dayjs());
}

/**
 * Onglet « Profils propriétaires » : la liste arrive en entier (bornée par la
 * copropriété), la recherche et la pagination se font en local (préfixe
 * d'URL « po »). Le bandeau des quotes-parts incomplètes reste au-dessus.
 */
export const OwnerProfilesTab: React.FC<OwnerProfilesTabProps> = ({
  items,
  incompleteShares,
  loading,
  lots,
  lotsById,
  propertiesByInternalReference,
  invitingProfileId,
  revokingProfileId,
  onInvite,
  onRevoke
}) => {
  const rows = useMemo<OwnerRow[]>(() => {
    const incompleteLotIds = new Set(incompleteShares.map(item => item.lotId));
    return items.map(profile => {
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
        situation: isOwnerCurrent(profile) ? 'current' : 'former',
        incompleteShare: incompleteLotIds.has(profile.lotId)
      };
    });
  }, [items, incompleteShares, lotsById, propertiesByInternalReference]);

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
        { value: 'former', label: t('Ancien') }
      ]
    },
    {
      key: 'portal',
      type: 'boolean',
      label: t('Accès au portail'),
      primary: true,
      tristate: true,
      trueLabel: t('Actif'),
      falseLabel: t('Inactif')
    },
    { key: 'incomplete', type: 'boolean', label: t('Quote-part incomplète') }
  ];

  const local = useLocalListSearch<OwnerRow>(rows, {
    paramPrefix: 'po',
    ariaLabel: t('Rechercher dans les profils propriétaires'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS
  });

  const columns: ColumnsType<OwnerRow> = [
    { title: t('Lot'), render: (_, row) => row.lotLabel },
    { title: t('Contact'), render: (_, row) => row.contactName },
    { title: t('Part (%)'), dataIndex: 'ownershipPercentage' },
    {
      title: t('Depuis'),
      dataIndex: 'ownedSince',
      render: (value: string) => dayjs(value).format(dateFormat('short'))
    },
    {
      title: t('Statut'),
      key: 'situation',
      render: (_, row) =>
        row.situation === 'current' ? <Tag color="green">{t('Actuel')}</Tag> : <Tag>{t('Ancien')}</Tag>
    },
    {
      title: t('Portail'),
      render: (_, row) => (row.portalAccessEnabled ? <Tag color="green">{t('Actif')}</Tag> : <Tag>{t('Inactif')}</Tag>)
    },
    {
      title: t('Accès portail'),
      key: 'portal-actions',
      exportable: false,
      render: (_, row) => (
        <Space wrap>
          <Button
            size="small"
            loading={invitingProfileId === row.id}
            disabled={row.isActive === false}
            onClick={() => onInvite(row)}
          >
            {t('Inviter au portail')}
          </Button>
          {row.portalAccessEnabled ? (
            <Button size="small" danger loading={revokingProfileId === row.id} onClick={() => onRevoke(row)}>
              {t("Révoquer l'accès")}
            </Button>
          ) : null}
        </Space>
      )
    }
  ];

  return (
    <>
      {incompleteShares.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('Quotes-parts incomplètes')}
          description={incompleteShares
            .map(item =>
              t('Lot {{lot}} : {{percentage}} % attribués', {
                lot: item.lotNumber,
                percentage: item.totalPercentage
              })
            )
            .join(' ; ')}
        />
      ) : null}
      <Table<OwnerRow>
        {...local.tableProps}
        helpId="syndic.profils.proprietaires"
        exportFilename={t('Profils propriétaires')}
        exportFetchAll={local.exportAll}
        scroll={{ x: 'max-content' }}
        rowKey="id"
        loading={loading}
        columns={columns}
        locale={local.isFiltered ? undefined : { emptyText: t('Aucun profil propriétaire pour cette copropriété.') }}
      />
    </>
  );
};
