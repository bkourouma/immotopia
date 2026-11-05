import React, { useState, useEffect } from 'react';
import { Space, Typography, Spin, Alert, Empty, Row, Col, Button, Pagination } from 'antd';
import { BankOutlined, HomeOutlined, ToolOutlined, SyncOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ownerPortalService } from '../../services/ownerPortalService';
import { PropertyCard } from '../../components/OwnerPortal/PropertyCard';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import { ListSearch, StateBlock } from '../../components/primitives';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

interface PropertyItem {
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
}

interface PropertiesData {
  properties: PropertyItem[];
  summary: {
    total: number;
    rented: number;
    available: number;
    inMaintenance: number;
  };
}

// Stables : déclarés HORS du composant (le filtrage local reste mémoïsé).
// L'API ne renvoie ni titre ni référence : le champ libre porte sur l'adresse et le locataire en place.
const TEXTE_RECHERCHE = [
  (property: PropertyItem) => property.address,
  (property: PropertyItem) => property.currentLease?.tenantName
];
const ACCESSEURS = {
  status: (property: PropertyItem) => property.status,
  propertyType: (property: PropertyItem) => property.propertyType,
  transactionMode: (property: PropertyItem) => property.transactionModes
};

const PAGE_SIZE = 12;

export default function Properties() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PropertiesData | null>(null);

  useEffect(() => {
    loadProperties();
  }, []);

  const loadProperties = async () => {
    try {
      setLoading(true);
      setError(null);
      // Liste reçue en entier : la recherche se fait ici, l'appel part sans filtre.
      const response = await ownerPortalService.getProperties();
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError(t('Erreur lors du chargement des propriétés'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des propriétés'));
    } finally {
      setLoading(false);
    }
  };

  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Adresse, locataire…') },
    {
      key: 'status',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: [
        { value: 'AVAILABLE', label: t('Disponible') },
        { value: 'RENTED', label: t('Loué') },
        { value: 'UNDER_REVIEW', label: t('En révision') },
        { value: 'RESERVED', label: t('Réservé') },
        { value: 'UNDER_OFFER', label: t('Sous offre') }
      ]
    },
    {
      key: 'propertyType',
      type: 'multiSelect',
      label: t('Type de propriété'),
      primary: true,
      options: [
        { value: 'APPARTEMENT', label: t('Appartement') },
        { value: 'MAISON_VILLA', label: t('Maison / Villa') },
        { value: 'STUDIO', label: t('Studio') },
        { value: 'DUPLEX_TRIPLEX', label: t('Duplex / Triplex') },
        { value: 'BUREAU', label: t('Bureau') },
        { value: 'BOUTIQUE_COMMERCIAL', label: t('Boutique / Commercial') },
        { value: 'TERRAIN', label: t('Terrain') }
      ]
    },
    {
      key: 'transactionMode',
      type: 'multiSelect',
      label: t('Mode de transaction'),
      options: [
        { value: 'RENTAL', label: t('Location') },
        { value: 'SALE', label: t('Vente') },
        { value: 'SHORT_TERM', label: t('Location courte durée') }
      ]
    }
  ];

  const local = useLocalListSearch<PropertyItem>(data?.properties, {
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS,
    defaultPageSize: PAGE_SIZE
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement des propriétés...')} />
      </div>
    );
  }

  if (error) {
    return <Alert message={t('Erreur')} description={error} type="error" showIcon />;
  }

  if (!data) {
    return <Empty description={t('Aucune propriété disponible')} />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Mes propriétés')}</Title>
          <Text type="secondary">{t('Gérez votre portefeuille immobilier')}</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={loadProperties}
          loading={loading}
          aria-label={t('Rafraîchir les propriétés')}
        >
          {t('Actualiser')}
        </Button>
      </div>

      {/* Portfolio Summary Cards (T036) */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title={t('Total')}
            value={data.summary.total}
            icon={<BankOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ fontSize: 24 }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title={t('Louées')}
            value={data.summary.rented}
            icon={<HomeOutlined style={{ color: '#52c41a' }} />}
            valueStyle={{ fontSize: 24, color: '#52c41a' }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title={t('Disponibles')}
            value={data.summary.available}
            icon={<HomeOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ fontSize: 24, color: '#1890ff' }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title={t('En maintenance')}
            value={data.summary.inMaintenance}
            icon={<ToolOutlined style={{ color: '#faad14' }} />}
            valueStyle={{ fontSize: 24, color: '#faad14' }}
          />
        </Col>
      </Row>

      {/* Recherche locale : la liste arrive en entier (cartes de synthèse : tous les biens, hors recherche) */}
      <ListSearch {...local.searchProps} />

      {/* Property List */}
      <div>
        {local.total > 0 ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Row gutter={[16, 16]}>
              {local.pageItems.map(property => (
                <Col xs={24} sm={12} lg={8} key={property.id}>
                  <PropertyCard property={property} />
                </Col>
              ))}
            </Row>
            {(local.total > local.pageSize || local.page > 1) && (
              <Pagination
                align="end"
                current={local.page}
                pageSize={local.pageSize}
                total={local.total}
                pageSizeOptions={[12, 24, 48, 96]}
                showSizeChanger
                onChange={local.dataViewProps.onPageChange}
              />
            )}
          </Space>
        ) : local.isFiltered ? (
          <StateBlock
            variant="no-results"
            actions={[{ label: t('Effacer les critères'), onClick: local.clear, primary: true }]}
          />
        ) : (
          <Empty description={t('Aucune propriété disponible')} />
        )}
      </div>
    </Space>
  );
}
