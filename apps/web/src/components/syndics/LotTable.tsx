import React from 'react';
import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SyndicateLot } from '../../types/syndic-types';

const { Text } = Typography;

const lotTypeLabels: Record<SyndicateLot['lotType'], string> = {
  APARTMENT: 'Appartement',
  PARKING: 'Parking',
  CELLAR: 'Cave',
  OFFICE: 'Bureau',
  COMMERCIAL: 'Commerce',
  OTHER: 'Autre',
};

function buildPropertyNomenclatureLabel(property: NonNullable<SyndicateLot['property']>): string {
  const ownerLabel = property.owner?.fullName?.trim() || '';
  const title = property.title?.trim() || property.internalReference || property.id || 'Sans libellé';
  return ownerLabel ? `${ownerLabel} - ${title}` : title;
}

interface LotTableProps {
  lots: SyndicateLot[];
  loading?: boolean;
  showMobileHint?: boolean;
  propertyLabelById?: Record<string, string>;
  ownerLabelById?: Record<string, string>;
  ownerLabelByEmail?: Record<string, string>;
  onEdit?: (lot: SyndicateLot) => void;
  onViewAccount?: (lot: SyndicateLot) => void;
  onAssignTenant?: (lot: SyndicateLot) => void;
}

export const LotTable: React.FC<LotTableProps> = ({
  lots,
  loading = false,
  showMobileHint = false,
  propertyLabelById,
  ownerLabelById,
  ownerLabelByEmail,
  onEdit,
  onViewAccount,
  onAssignTenant,
}) => {
  const columns: ColumnsType<SyndicateLot> = [
    {
      title: 'Lot',
      dataIndex: 'lotNumber',
      key: 'lotNumber',
      width: 160,
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'lotType',
      key: 'lotType',
      width: 140,
      render: (value: SyndicateLot['lotType']) => <Tag>{lotTypeLabels[value]}</Tag>,
    },
    {
      title: 'Tantièmes généraux',
      dataIndex: 'generalShares',
      key: 'generalShares',
      width: 170,
      align: 'right',
    },
    {
      title: 'Tantièmes spéciaux',
      dataIndex: 'specialShares',
      key: 'specialShares',
      width: 170,
      align: 'right',
      responsive: ['md'],
      render: (value?: number | null) => value ?? '-',
    },
    {
      title: 'Propriétaire',
      dataIndex: 'ownerContactId',
      key: 'ownerContactId',
      width: 250,
      ellipsis: true,
      render: (_value: string | null | undefined, lot: SyndicateLot) => {
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

        return 'Non renseigné';
      },
    },
    {
      title: 'Locataire',
      key: 'tenant',
      width: 250,
      ellipsis: true,
      responsive: ['md'],
      render: (_value: string | null | undefined, lot: SyndicateLot) => {
        const activeAssignments = (lot.tenantAssignments || []).filter((assignment) => assignment.isActive);
        if (activeAssignments.length === 0) {
          return 'Non renseigné';
        }

        return activeAssignments
          .map((assignment) => {
            const contact = assignment.contact;
            if (!contact) {
              return assignment.tenantId;
            }
            const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
            return fullName || contact.legalName || contact.email || assignment.tenantId;
          })
          .join(', ');
      },
    },
    {
      title: 'Bien lié',
      dataIndex: 'propertyId',
      key: 'propertyId',
      width: 320,
      ellipsis: true,
      responsive: ['lg'],
      render: (_value: string | null | undefined, lot: SyndicateLot) => {
        if (!lot.propertyId) {
          return 'Non lié';
        }

        if (propertyLabelById?.[lot.propertyId]) {
          return propertyLabelById[lot.propertyId];
        }

        if (lot.property) {
          return buildPropertyNomenclatureLabel(lot.property);
        }

        return lot.propertyId;
      },
    },
    ...(onEdit || onViewAccount || onAssignTenant
      ? [
          {
            title: 'Actions',
            key: 'actions',
            width: 240,
            render: (_: unknown, lot: SyndicateLot) => (
              <Space>
                {onEdit ? (
                  <Button size="small" onClick={() => onEdit(lot)}>
                    Modifier
                  </Button>
                ) : null}
                {onViewAccount ? (
                  <Button size="small" onClick={() => onViewAccount(lot)}>
                    Compte
                  </Button>
                ) : null}
                {onAssignTenant ? (
                  <Button size="small" onClick={() => onAssignTenant(lot)}>
                    Locataire
                  </Button>
                ) : null}
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <Table
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
          Faites défiler horizontalement en bas du tableau pour voir toutes les colonnes.
        </Text>
      ) : null}
    </div>
  );
};
