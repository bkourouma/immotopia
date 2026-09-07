import React from 'react';
import { Card, Tag, Space, Typography, Button } from 'antd';
import { HomeOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

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

const propertyTypeLabels: Record<string, string> = {
  APPARTEMENT: 'Appartement',
  MAISON_VILLA: 'Maison / Villa',
  STUDIO: 'Studio',
  DUPLEX_TRIPLEX: 'Duplex / Triplex',
  CHAMBRE_COLOCATION: 'Chambre / Colocation',
  BUREAU: 'Bureau',
  BOUTIQUE_COMMERCIAL: 'Boutique / Commercial',
  ENTREPOT_INDUSTRIEL: 'Entrepôt / Industriel',
  TERRAIN: 'Terrain',
  IMMEUBLE: 'Immeuble',
  PARKING_BOX: 'Parking / Box',
  LOT_PROGRAMME_NEUF: 'Lot programme neuf',
};

const statusLabels: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Brouillon', color: 'default' },
  UNDER_REVIEW: { label: 'En révision', color: 'processing' },
  AVAILABLE: { label: 'Disponible', color: 'success' },
  RESERVED: { label: 'Réservé', color: 'warning' },
  UNDER_OFFER: { label: 'Sous offre', color: 'warning' },
  RENTED: { label: 'Loué', color: 'success' },
  SOLD: { label: 'Vendu', color: 'default' },
  ARCHIVED: { label: 'Archivé', color: 'default' },
};

const transactionModeLabels: Record<string, string> = {
  SALE: 'Vente',
  RENTAL: 'Location',
  SHORT_TERM: 'Location courte durée',
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
};

export const PropertyCard: React.FC<PropertyCardProps> = ({ property }) => {
  const navigate = useNavigate();
  const statusConfig = statusLabels[property.status] || { label: property.status, color: 'default' };

  return (
    <Card
      hoverable
      style={{ marginBottom: 16 }}
      actions={[
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/owner/properties/${property.id}`)}
        >
          Voir les détails
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
            <Tag>{propertyTypeLabels[property.propertyType] || property.propertyType}</Tag>
            {property.transactionModes.map(mode => (
              <Tag key={mode}>{transactionModeLabels[mode] || mode}</Tag>
            ))}
          </div>
        </div>

        {property.currentLease && (
          <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: 4 }}>
            <Space direction="vertical" size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <HomeOutlined /> Bail actif
              </Text>
              <Text strong>Locataire: {property.currentLease.tenantName}</Text>
              <Text type="secondary">
                Loyer: {formatCurrency(property.currentLease.monthlyRent)} / mois
              </Text>
            </Space>
          </div>
        )}

        {!property.currentLease && property.status === 'AVAILABLE' && (
          <div style={{ padding: '12px', background: '#e6f7ff', borderRadius: 4 }}>
            <Text type="secondary">Propriété disponible</Text>
          </div>
        )}
      </Space>
    </Card>
  );
};
