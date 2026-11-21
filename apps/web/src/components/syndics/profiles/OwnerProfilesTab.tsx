import React, { useMemo } from 'react';
import { Alert, Button, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView } from '../../primitives';
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
  /** `current` : profil actif et non clos ; `upcoming` : actif mais pas encore commencé ; `former` : clos ou désactivé. */
  situation: 'current' | 'upcoming' | 'former';
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
  /** Proposition affichée quand la copropriété n'a encore aucun profil propriétaire. */
  onCreate?: () => void;
}

/**
 * Un profil propriétaire est « actuel » s'il est actif, commencé, et que sa fin est vide ou à venir (même règle que
 * l'API : un profil futur — vente en cours — ne compte pas encore, ni dans les parts ni dans le propriétaire du lot).
 */
function ownerSituation(profile: LotOwnerProfile): OwnerRow['situation'] {
  if (profile.isActive === false) return 'former';
  if (profile.ownedUntil && !dayjs(profile.ownedUntil).isAfter(dayjs())) return 'former';
  return dayjs(profile.ownedSince).isAfter(dayjs()) ? 'upcoming' : 'current';
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
  onRevoke,
  onCreate
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
        situation: ownerSituation(profile),
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
        { value: 'upcoming', label: t('À venir') },
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
        row.situation === 'current' ? (
          <Tag color="green">{t('Actuel')}</Tag>
        ) : row.situation === 'upcoming' ? (
          <Tag color="blue">{t('À venir')}</Tag>
        ) : (
          <Tag>{t('Ancien')}</Tag>
        )
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
      <DataView<OwnerRow>
        {...local.dataViewProps}
        helpId="syndic.profils.proprietaires"
        aria-label={t('Profils propriétaires')}
        export={{ filename: t('Profils propriétaires'), fetchAll: local.exportAll }}
        rowKey={row => row.id}
        loading={loading}
        columns={columns}
        scrollX={860}
        emptyDescription={t('Aucun profil propriétaire pour cette copropriété.')}
        emptyAction={onCreate ? { label: t('Profil propriétaire'), onClick: onCreate } : undefined}
        renderCard={row => (
          <DataCard
            title={row.contactName}
            subtitle={row.lotLabel}
            status={row.situation === 'current' ? <Tag color="green">{t('Actuel')}</Tag> : <Tag>{t('Ancien')}</Tag>}
            fields={[
              { label: t('Part (%)'), value: row.ownershipPercentage },
              { label: t('Depuis'), value: dayjs(row.ownedSince).format(dateFormat('short')) },
              {
                label: t('Portail'),
                value: row.portalAccessEnabled ? <Tag color="green">{t('Actif')}</Tag> : <Tag>{t('Inactif')}</Tag>
              }
            ]}
            primaryAction={
              row.isActive === false
                ? undefined
                : {
                    label: t('Inviter au portail'),
                    onClick: () => onInvite(row),
                    loading: invitingProfileId === row.id
                  }
            }
            secondaryActions={
              row.portalAccessEnabled
                ? [{ key: 'revoke', label: t("Révoquer l'accès"), danger: true, onClick: () => onRevoke(row) }]
                : undefined
            }
          />
        )}
      />
    </>
  );
};
