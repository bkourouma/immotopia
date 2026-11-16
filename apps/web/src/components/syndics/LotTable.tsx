import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button, Popconfirm, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Table } from '../primitives';
import { SyndicateLot } from '../../types/syndic-types';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion, SearchOption } from '../../utils/list-search';
import { localizedList } from '../../i18n/localized';
import { t } from '../../i18n/t';
import { getLotTypeLabel } from '../../utils/syndic-lot-label';

const { Text } = Typography;

type TenantAssignment = NonNullable<SyndicateLot['tenantAssignments']>[number];

interface TenantEntry {
  key: string;
  name: string;
  /** Affectation à laquelle on peut mettre fin ; absente pour un profil locataire. */
  assignment?: TenantAssignment;
}

function contactName(
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    legalName?: string | null;
    email?: string | null;
  } | null
): string {
  if (!contact) return '';
  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  return fullName || contact.legalName || contact.email || '';
}

/**
 * Locataires d'un lot : affectations actives et profils locataires actuels,
 * dédoublonnés par contact (sinon par nom). L'affectation prime sur le profil
 * car c'est elle qu'on peut terminer depuis cet écran.
 */
function mergeTenants(lot: SyndicateLot): TenantEntry[] {
  const entries = new Map<string, TenantEntry>();
  for (const assignment of (lot.tenantAssignments || []).filter(item => item.isActive)) {
    const name = contactName(assignment.contact) || assignment.tenantId;
    const key = assignment.contact?.id || assignment.tenantId || name.toLowerCase();
    if (!entries.has(key)) entries.set(key, { key, name, assignment });
  }
  for (const profile of lot.tenantProfiles || []) {
    const name = contactName(profile.contact);
    const key = profile.contactId || profile.contact?.id || name.toLowerCase();
    if (!name && !key) continue;
    const existing = [...entries.values()].find(
      entry => entry.key === key || (name && entry.name.toLowerCase() === name.toLowerCase())
    );
    if (!existing) entries.set(key, { key, name: name || key });
  }
  return [...entries.values()];
}

// Le bien seul : la colonne « Propriétaire » affiche déjà son propriétaire.
function buildPropertyLabel(property: NonNullable<SyndicateLot['property']>): string {
  return property.title?.trim() || property.internalReference || property.id || t('Sans libellé');
}

/** Propriétaires d'un lot tels que la colonne « Propriétaire » les affiche (indivision : « Nom 1 (50 %), Nom 2 (50 %) »). */
function lotOwnerLabel(
  lot: SyndicateLot,
  ownerLabelById?: Record<string, string>,
  ownerLabelByEmail?: Record<string, string>
): string {
  // Propriétaires calculés par l'API à partir des profils actuels du lot (indivision : « Nom 1 (50 %), Nom 2 (50 %) »).
  if (lot.ownersLabel) {
    return lot.ownersLabel;
  }
  const coowner = lot.coowner;
  if (coowner) {
    const fullName = coowner.fullName?.trim();
    if (fullName) {
      return fullName;
    }
    const firstLast = `${coowner.firstName || ''} ${coowner.lastName || ''}`.trim();
    if (firstLast) {
      return firstLast;
    }
    if (coowner.legalName) {
      return coowner.legalName;
    }
    if (coowner.email) {
      return coowner.email;
    }
  }

  if (lot.ownerContactId) {
    return ownerLabelById?.[lot.ownerContactId] || lot.ownerContactId;
  }

  const ownerEmail = lot.property?.owner?.email?.trim().toLowerCase();
  if (ownerEmail && ownerLabelByEmail?.[ownerEmail]) {
    return ownerLabelByEmail[ownerEmail];
  }

  return t('Non renseigné');
}

/** Bien lié d'un lot tel que la colonne « Bien lié » l'affiche. */
function lotPropertyLabel(lot: SyndicateLot, propertyLabelById?: Record<string, string>): string {
  if (!lot.propertyId) {
    return t('Non lié');
  }
  if (propertyLabelById?.[lot.propertyId]) {
    return propertyLabelById[lot.propertyId];
  }
  if (lot.property) {
    return buildPropertyLabel(lot.property);
  }
  return lot.propertyId;
}

/**
 * Libellé de l'accès au portail copropriétaire d'un lot (même vocabulaire que la
 * colonne « Portail » de « Profils et incidents »). `null` quand l'API n'a pas
 * renvoyé l'information.
 */
function portalAccessLabel(lot: SyndicateLot): string | null {
  const access = lot.portalAccess;
  if (!access) return null;
  switch (access.status) {
    case 'ACTIVE':
      return t('Actif');
    case 'PARTIAL':
      return t('Partiel ({{active}}/{{total}})', { active: access.activeCount, total: access.ownerCount });
    case 'INACTIVE':
      return t('Inactif');
    default:
      return t('Sans profil');
  }
}

const portalAccessColors = { ACTIVE: 'green', PARTIAL: 'gold', INACTIVE: undefined, NONE: undefined } as const;

/** Détail par propriétaire, en infobulle native : utile en indivision (« Nom 1 : Actif, Nom 2 : Inactif »). */
function portalAccessDetail(lot: SyndicateLot): string | undefined {
  const access = lot.portalAccess;
  if (!access) return undefined;
  if (access.status === 'NONE') {
    return t("Aucun profil propriétaire sur ce lot : créez-en un dans « Profils et incidents » pour ouvrir l'accès.");
  }
  if (!lot.owners || lot.owners.length < 2) return undefined;
  return lot.owners.map(owner => `${owner.name} : ${owner.portalAccessEnabled ? t('Actif') : t('Inactif')}`).join('\n');
}

const LOT_TYPES = ['APARTMENT', 'PARKING', 'CELLAR', 'OFFICE', 'COMMERCIAL', 'OTHER'] as const;

// Libellés vivants : un `t()` évalué au chargement du module figerait la langue.
const LOT_TYPE_OPTIONS = localizedList((): SearchOption[] =>
  LOT_TYPES.map(value => ({ value, label: getLotTypeLabel(value) ?? value }))
);
const PORTAL_OPTIONS = localizedList((): SearchOption[] => [
  { value: 'ACTIVE', label: t('Actif') },
  { value: 'PARTIAL', label: t('Partiel') },
  { value: 'INACTIVE', label: t('Inactif') },
  { value: 'NONE', label: t('Sans profil') }
]);

// Stables (hors du composant) : le filtrage reste mémoïsé.
const ACCESSEURS = {
  lotType: (lot: SyndicateLot) => lot.lotType,
  portal: (lot: SyndicateLot) => lot.portalAccess?.status,
  tenant: (lot: SyndicateLot) => mergeTenants(lot).length > 0,
  active: (lot: SyndicateLot) => lot.generalShares !== 0
};

interface LotTableProps {
  lots: SyndicateLot[];
  /** Préfixe d'URL de la recherche (sans point) : à poser quand l'écran porte un autre tableau filtrable. */
  paramPrefix?: string;
  /** Nom accessible de la zone de recherche (défaut : « Rechercher dans les lots »). */
  ariaLabel?: string;
  loading?: boolean;
  showMobileHint?: boolean;
  /**
   * Lien vers « Profils et incidents », où l'on invite au portail ou révoque
   * l'accès. Absent : la colonne « Portail » s'affiche sans lien.
   */
  portalManageHref?: string;
  /** Lots visés par un paiement mobile money déclaré en attente (spec 047) : pastille à côté du numéro. */
  declaredPendingLotIds?: ReadonlySet<string>;
  propertyLabelById?: Record<string, string>;
  ownerLabelById?: Record<string, string>;
  ownerLabelByEmail?: Record<string, string>;
  onEdit?: (lot: SyndicateLot) => void;
  /** Suppression (avec confirmation) ; l'écran gère le refus 409 et propose de désactiver. */
  onDelete?: (lot: SyndicateLot) => void;
  onViewAccount?: (lot: SyndicateLot) => void;
  onAssignTenant?: (lot: SyndicateLot) => void;
  /** Désactivation directe (tantièmes à 0), après confirmation dans la table. */
  onDeactivate?: (lot: SyndicateLot) => void;
  /** Réactivation : l'écran ouvre la modification du lot pour ressaisir les tantièmes. */
  onReactivate?: (lot: SyndicateLot) => void;
  /** Fin d'une affectation locataire (après confirmation dans la table). */
  onEndTenantAssignment?: (lot: SyndicateLot, assignment: TenantAssignment) => void;
}

export const LotTable: React.FC<LotTableProps> = ({
  lots,
  paramPrefix,
  ariaLabel,
  loading = false,
  showMobileHint = false,
  portalManageHref,
  declaredPendingLotIds,
  propertyLabelById,
  ownerLabelById,
  ownerLabelByEmail,
  onEdit,
  onDelete,
  onViewAccount,
  onAssignTenant,
  onDeactivate,
  onReactivate,
  onEndTenantAssignment
}) => {
  // Le champ libre cherche ce que les colonnes affichent (les libellés dépendent des annuaires reçus en props).
  const searchText = useMemo(
    () => [
      (lot: SyndicateLot) => lot.lotNumber,
      (lot: SyndicateLot) => lotOwnerLabel(lot, ownerLabelById, ownerLabelByEmail),
      (lot: SyndicateLot) => lotPropertyLabel(lot, propertyLabelById),
      (lot: SyndicateLot) => mergeTenants(lot).map(entry => entry.name)
    ],
    [ownerLabelById, ownerLabelByEmail, propertyLabelById]
  );

  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('N° de lot, propriétaire, bien lié, locataire…')
    },
    { key: 'lotType', type: 'multiSelect', label: t('Type'), primary: true, options: LOT_TYPE_OPTIONS },
    { key: 'portal', type: 'multiSelect', label: t('Portail'), primary: true, options: PORTAL_OPTIONS },
    {
      key: 'tenant',
      type: 'boolean',
      label: t('Locataire'),
      tristate: true,
      trueLabel: t('Occupé'),
      falseLabel: t('Non occupé')
    },
    {
      key: 'active',
      type: 'boolean',
      label: t('Statut du lot'),
      tristate: true,
      trueLabel: t('Actif'),
      falseLabel: t('Inactif')
    }
  ];

  const local = useLocalListSearch<SyndicateLot>(lots, {
    paramPrefix,
    ariaLabel: ariaLabel ?? t('Rechercher dans les lots'),
    defaultPageSize: 20,
    criteria,
    text: searchText,
    accessors: ACCESSEURS
  });

  const columns: ColumnsType<SyndicateLot> = [
    {
      title: t('Lot'),
      dataIndex: 'lotNumber',
      key: 'lotNumber',
      width: 160,
      // Le rendu accole le numéro et l'étiquette « Inactif » : on n'exporte que le numéro.
      exportValue: (lot: SyndicateLot) => lot.lotNumber,
      render: (value: string, lot: SyndicateLot) => (
        <Space size={6}>
          <Text strong>{value}</Text>
          {lot.generalShares === 0 ? <Tag>{t('Inactif')}</Tag> : null}
          {declaredPendingLotIds?.has(lot.id) ? <Tag color="processing">{t('Paiement déclaré')}</Tag> : null}
        </Space>
      )
    },
    {
      title: t('Type'),
      dataIndex: 'lotType',
      key: 'lotType',
      width: 140,
      render: (value: SyndicateLot['lotType']) => <Tag>{getLotTypeLabel(value) ?? value}</Tag>
    },
    {
      title: t('Tantièmes généraux'),
      dataIndex: 'generalShares',
      key: 'generalShares',
      width: 170,
      align: 'end'
    },
    {
      title: t('Tantièmes spéciaux'),
      dataIndex: 'specialShares',
      key: 'specialShares',
      width: 170,
      align: 'end',
      responsive: ['md'],
      render: (value?: number | null) => value ?? '-'
    },
    {
      title: t('Propriétaire'),
      dataIndex: 'ownerContactId',
      key: 'ownerContactId',
      width: 250,
      ellipsis: true,
      render: (_value: string | null | undefined, lot: SyndicateLot) => {
        return lotOwnerLabel(lot, ownerLabelById, ownerLabelByEmail);
      }
    },
    {
      title: t('Portail'),
      key: 'portalAccess',
      width: 200,
      // Le rendu accole l'étiquette et le lien : on n'exporte que l'état.
      exportValue: (lot: SyndicateLot) => portalAccessLabel(lot) ?? '',
      render: (_value: unknown, lot: SyndicateLot) => {
        const access = lot.portalAccess;
        const label = portalAccessLabel(lot);
        if (!access || !label) {
          return '-';
        }
        return (
          <Space size={6} wrap>
            <Tag color={portalAccessColors[access.status]} title={portalAccessDetail(lot)}>
              {label}
            </Tag>
            {portalManageHref ? (
              <Link
                to={portalManageHref}
                aria-label={t("Gérer l'accès au portail du lot {{lot}}", { lot: lot.lotNumber })}
              >
                {t("Gérer l'accès")}
              </Link>
            ) : null}
          </Space>
        );
      }
    },
    {
      title: t('Locataire'),
      key: 'tenant',
      width: 250,
      responsive: ['md'],
      // Le rendu accole des boutons « Mettre fin » : on n'exporte que les noms.
      exportValue: (lot: SyndicateLot) =>
        mergeTenants(lot)
          .map(entry => entry.name)
          .join(', '),
      render: (_value: string | null | undefined, lot: SyndicateLot) => {
        const tenants = mergeTenants(lot);
        if (tenants.length === 0) {
          return t('Non renseigné');
        }

        return (
          <Space direction="vertical" size={2}>
            {tenants.map(entry => (
              <Space key={entry.key} size={4} wrap>
                <span>{entry.name}</span>
                {entry.assignment && onEndTenantAssignment ? (
                  <Popconfirm
                    title={t("Mettre fin à l'affectation de ce locataire ?")}
                    description={t("Le locataire ne sera plus rattaché à ce lot. L'historique est conservé.")}
                    okText={t('Mettre fin')}
                    cancelText={t('Annuler')}
                    onConfirm={() => onEndTenantAssignment(lot, entry.assignment as TenantAssignment)}
                  >
                    <Button
                      type="link"
                      size="small"
                      aria-label={t("Mettre fin à l'affectation de {{name}} sur le lot {{lot}}", {
                        name: entry.name,
                        lot: lot.lotNumber
                      })}
                    >
                      {t('Mettre fin')}
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            ))}
          </Space>
        );
      }
    },
    {
      title: t('Bien lié'),
      dataIndex: 'propertyId',
      key: 'propertyId',
      width: 320,
      ellipsis: true,
      responsive: ['lg'],
      render: (_value: string | null | undefined, lot: SyndicateLot) => {
        return lotPropertyLabel(lot, propertyLabelById);
      }
    },
    ...(onEdit || onDelete || onViewAccount || onAssignTenant || onDeactivate || onReactivate
      ? [
          {
            title: t('Actions'),
            key: 'actions',
            width: 340,
            render: (_: unknown, lot: SyndicateLot) => (
              <Space>
                {onEdit ? (
                  <Button size="small" onClick={() => onEdit(lot)}>
                    {t('Modifier')}
                  </Button>
                ) : null}
                {onViewAccount ? (
                  <Button size="small" onClick={() => onViewAccount(lot)}>
                    {t('Compte')}
                  </Button>
                ) : null}
                {onAssignTenant ? (
                  <Button size="small" onClick={() => onAssignTenant(lot)}>
                    {t('Locataire')}
                  </Button>
                ) : null}
                {onDeactivate && lot.generalShares > 0 ? (
                  <Popconfirm
                    title={t('Désactiver ce lot ?')}
                    description={t(
                      'Le lot ne participera plus aux répartitions de charges ni aux votes. Ses données sont conservées et vous pourrez le réactiver.'
                    )}
                    okText={t('Désactiver')}
                    cancelText={t('Annuler')}
                    onConfirm={() => onDeactivate(lot)}
                  >
                    <Button size="small">{t('Désactiver')}</Button>
                  </Popconfirm>
                ) : null}
                {onReactivate && lot.generalShares === 0 ? (
                  <Button size="small" onClick={() => onReactivate(lot)}>
                    {t('Réactiver')}
                  </Button>
                ) : null}
                {onDelete ? (
                  <Popconfirm
                    title={t('Supprimer ce lot ?')}
                    description={t('Action définitive. Impossible si le lot a des appels, paiements ou reçus.')}
                    okText={t('Supprimer')}
                    cancelText={t('Annuler')}
                    onConfirm={() => onDelete(lot)}
                  >
                    <Button size="small" danger>
                      {t('Supprimer')}
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
            )
          }
        ]
      : [])
  ];

  return (
    <div>
      <Table
        {...local.tableProps}
        helpId="syndic.lots.tableau"
        aria-label={t('Tableau des lots')}
        exportFilename={t('Lots')}
        exportFetchAll={local.exportAll}
        className="lot-table"
        rowKey="id"
        size="middle"
        columns={columns}
        loading={loading}
        locale={local.isFiltered ? undefined : { emptyText: t('Aucun lot enregistré') }}
        scroll={{ x: 1400 }}
        sticky
      />
      {showMobileHint ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('Faites défiler horizontalement en bas du tableau pour voir toutes les colonnes.')}
        </Text>
      ) : null}
    </div>
  );
};
