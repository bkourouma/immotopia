import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Popconfirm, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Table } from '../primitives';
import { SyndicateLot } from '../../types/syndic-types';
import { t } from '../../i18n/t';

const { Text } = Typography;

const lotTypeLabels: Record<SyndicateLot['lotType'], string> = {
  APARTMENT: 'Appartement',
  PARKING: 'Parking',
  CELLAR: 'Cave',
  OFFICE: 'Bureau',
  COMMERCIAL: 'Commerce',
  OTHER: 'Autre'
};

// Le bien seul : la colonne « Propriétaire » affiche déjà son propriétaire.
function buildPropertyLabel(property: NonNullable<SyndicateLot['property']>): string {
  return property.title?.trim() || property.internalReference || property.id || t('Sans libellé');
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

interface LotTableProps {
  lots: SyndicateLot[];
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
}

export const LotTable: React.FC<LotTableProps> = ({
  lots,
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
  onAssignTenant
}) => {
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
      render: (value: SyndicateLot['lotType']) => <Tag>{lotTypeLabels[value]}</Tag>
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
      ellipsis: true,
      responsive: ['md'],
      render: (_value: string | null | undefined, lot: SyndicateLot) => {
        const activeAssignments = (lot.tenantAssignments || []).filter(assignment => assignment.isActive);
        if (activeAssignments.length === 0) {
          return t('Non renseigné');
        }

        return activeAssignments
          .map(assignment => {
            const contact = assignment.contact;
            if (!contact) {
              return assignment.tenantId;
            }
            const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
            return fullName || contact.legalName || contact.email || assignment.tenantId;
          })
          .join(', ');
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
    },
    ...(onEdit || onDelete || onViewAccount || onAssignTenant
      ? [
          {
            title: t('Actions'),
            key: 'actions',
            width: 240,
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
        exportFilename={t('Lots')}
        className="lot-table"
        rowKey="id"
        size="middle"
        columns={columns}
        dataSource={lots}
        loading={loading}
        pagination={{ pageSize: 8, hideOnSinglePage: true }}
        locale={{ emptyText: 'Aucun lot enregistré' }}
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
