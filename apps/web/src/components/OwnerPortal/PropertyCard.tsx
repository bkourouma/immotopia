import React from 'react';
import { Card, Tag, Space, Typography, Button } from 'antd';
import { HomeOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text } = Typography;

interface PropertyCardProps {
  property: {
    id: string;
    address: string;
    propertyType: string;
    status: string;
    transactionModes: string[];
    currentLease?: {
      id: string;
      tenantName: string;
      startDate: string;
      endDate: string | null;
      monthlyRent: number;
      status: string;
    } | null;
  };
}

function propertyTypeLabels(): Record<string, string> {
  return {
    APPARTEMENT: t('Appartement'),
    MAISON_VILLA: t('Maison / Villa'),
    STUDIO: t('Studio'),
    DUPLEX_TRIPLEX: t('Duplex / Triplex'),
    CHAMBRE_COLOCATION: t('Chambre / Colocation'),
    BUREAU: t('Bureau'),
    BOUTIQUE_COMMERCIAL: t('Boutique / Commercial'),
    ENTREPOT_INDUSTRIEL: t('Entrepôt / Industriel'),
    TERRAIN: t('Terrain'),
    IMMEUBLE: t('Immeuble'),
    PARKING_BOX: t('Parking / Box'),
    LOT_PROGRAMME_NEUF: t('Lot programme neuf')
  };
}

function statusLabels(): Record<string, { label: string; color: string }> {
  return {
    DRAFT: { label: t('Brouillon'), color: 'default' },
    UNDER_REVIEW: { label: t('En révision'), color: 'processing' },
    AVAILABLE: { label: t('Disponible'), color: 'success' },
    RESERVED: { label: t('Réservé'), color: 'warning' },
    UNDER_OFFER: { label: t('Sous offre'), color: 'warning' },
    RENTED: { label: t('Loué'), color: 'success' },
    SOLD: { label: t('Vendu'), color: 'default' },
    ARCHIVED: { label: t('Archivé'), color: 'default' }
  };
}

function transactionModeLabels(): Record<string, string> {
  return {
    SALE: t('Vente'),
    RENTAL: t('Location'),
    SHORT_TERM: t('Location courte durée')
  };
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
};

export const PropertyCard: React.FC<PropertyCardProps> = ({ property }) => {
  const navigate = useNavigate();

  /**
   * Le bail fait foi sur l'occupation, comme pour les compteurs du portefeuille.
   * Un bien dont la colonne `status` dit RENTED alors qu'aucun bail actif ne lui
   * est rattache n'est pas loue : il est a louer. Sans cette regle, la carte
   * affiche « Loue » sans locataire ni loyer, pendant que le compteur au-dessus
   * la range dans les disponibles.
   */
  const isStaleRented = property.status === 'RENTED' && !property.currentLease;
  const effectiveStatus = isStaleRented ? 'AVAILABLE' : property.status;
  const statusConfig = statusLabels()[effectiveStatus] || { label: property.status, color: 'default' };

  return (
    <Card
      hoverable
      style={{ marginBottom: 16 }}
      actions={[
        <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/owner/properties/${property.id}`)}>
          {t('Voir les détails')}
        </Button>
      ]}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Text strong style={{ fontSize: 16 }}>
            {property.address}
          </Text>
          <div style={{ marginTop: 8 }}>
            <Tag color={statusConfig.color}>{statusConfig.label}</Tag>
            <Tag>{propertyTypeLabels()[property.propertyType] || property.propertyType}</Tag>
            {property.transactionModes.map(mode => (
              <Tag key={mode}>{transactionModeLabels()[mode] || mode}</Tag>
            ))}
          </div>
        </div>

        {property.currentLease && (
          <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: 4 }}>
            <Space direction="vertical" size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <HomeOutlined /> {t('Bail actif')}
              </Text>
              <Text strong>Locataire: {property.currentLease.tenantName}</Text>
              <Text type="secondary">Loyer: {formatCurrency(property.currentLease.monthlyRent)} / mois</Text>
            </Space>
          </div>
        )}

        {!property.currentLease && effectiveStatus === 'AVAILABLE' && (
          <div style={{ padding: '12px', background: '#e6f7ff', borderRadius: 4 }}>
            <Text type="secondary">{t('Propriété disponible')}</Text>
          </div>
        )}
      </Space>
    </Card>
  );
};
