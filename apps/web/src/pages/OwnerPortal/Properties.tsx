import React, { useState, useEffect } from 'react';
import { Card, Select, Space, Typography, Spin, Alert, Empty, Row, Col, Statistic, Button } from 'antd';
import { BankOutlined, HomeOutlined, ToolOutlined, SyncOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ownerPortalService } from '../../services/ownerPortalService';
import { PropertyCard } from '../../components/OwnerPortal/PropertyCard';
import { StatCard } from '../../components/OwnerPortal/StatCard';

const { Title, Text } = Typography;
const { Option } = Select;

interface PropertiesData {
  properties: Array<{
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
  }>;
  summary: {
    total: number;
    rented: number;
    available: number;
    inMaintenance: number;
  };
}

const propertyTypeOptions = [
  { value: '', label: 'Tous les types' },
  { value: 'APPARTEMENT', label: 'Appartement' },
  { value: 'MAISON_VILLA', label: 'Maison / Villa' },
  { value: 'STUDIO', label: 'Studio' },
  { value: 'DUPLEX_TRIPLEX', label: 'Duplex / Triplex' },
  { value: 'BUREAU', label: 'Bureau' },
  { value: 'BOUTIQUE_COMMERCIAL', label: 'Boutique / Commercial' },
  { value: 'TERRAIN', label: 'Terrain' }
];

const statusOptions = [
  { value: '', label: 'Tous les statuts' },
  { value: 'AVAILABLE', label: 'Disponible' },
  { value: 'RENTED', label: 'Loué' },
  { value: 'UNDER_REVIEW', label: 'En révision' },
  { value: 'RESERVED', label: 'Réservé' },
  { value: 'UNDER_OFFER', label: 'Sous offre' }
];

const transactionModeOptions = [
  { value: '', label: 'Tous les modes' },
  { value: 'RENTAL', label: 'Location' },
  { value: 'SALE', label: 'Vente' },
  { value: 'SHORT_TERM', label: 'Location courte durée' }
];

export default function Properties() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PropertiesData | null>(null);
  const [filters, setFilters] = useState({
    status: '',
    propertyType: '',
    transactionMode: ''
  });

  useEffect(() => {
    loadProperties();
  }, [filters]);

  const loadProperties = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {};
      if (filters.status) params.status = filters.status;
      if (filters.propertyType) params.propertyType = filters.propertyType;
      if (filters.transactionMode) params.transactionMode = filters.transactionMode;

      const response = await ownerPortalService.getProperties(params);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError('Erreur lors du chargement des propriétés');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des propriétés');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement des propriétés..." />
      </div>
    );
  }

  if (error) {
    return <Alert message="Erreur" description={error} type="error" showIcon />;
  }

  if (!data) {
    return <Empty description="Aucune propriété disponible" />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="it-toolbar">
        <div>
          <Title level={2}>Mes propriétés</Title>
          <Text type="secondary">Gérez votre portefeuille immobilier</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={loadProperties}
          loading={loading}
          aria-label="Rafraîchir les propriétés"
        >
          Actualiser
        </Button>
      </div>

      {/* Portfolio Summary Cards (T036) */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total"
            value={data.summary.total}
            icon={<BankOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ fontSize: 24 }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Louées"
            value={data.summary.rented}
            icon={<HomeOutlined style={{ color: '#52c41a' }} />}
            valueStyle={{ fontSize: 24, color: '#52c41a' }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Disponibles"
            value={data.summary.available}
            icon={<HomeOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ fontSize: 24, color: '#1890ff' }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="En maintenance"
            value={data.summary.inMaintenance}
            icon={<ToolOutlined style={{ color: '#faad14' }} />}
            valueStyle={{ fontSize: 24, color: '#faad14' }}
          />
        </Col>
      </Row>

      {/* Filters (T046) */}
      <Card title="Filtres">
        <Space wrap>
          <Select
            style={{ width: 200 }}
            placeholder="Statut"
            value={filters.status || undefined}
            onChange={value => setFilters({ ...filters, status: value || '' })}
            allowClear
          >
            {statusOptions.map(opt => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>

          <Select
            style={{ width: 200 }}
            placeholder="Type de propriété"
            value={filters.propertyType || undefined}
            onChange={value => setFilters({ ...filters, propertyType: value || '' })}
            allowClear
          >
            {propertyTypeOptions.map(opt => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>

          <Select
            style={{ width: 200 }}
            placeholder="Mode de transaction"
            value={filters.transactionMode || undefined}
            onChange={value => setFilters({ ...filters, transactionMode: value || '' })}
            allowClear
          >
            {transactionModeOptions.map(opt => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>
        </Space>
      </Card>

      {/* Property List */}
      <div>
        {data.properties.length > 0 ? (
          <Row gutter={[16, 16]}>
            {data.properties.map(property => (
              <Col xs={24} sm={12} lg={8} key={property.id}>
                <PropertyCard property={property} />
              </Col>
            ))}
          </Row>
        ) : (
          <Empty description="Aucune propriété trouvée avec ces filtres" />
        )}
      </div>
    </Space>
  );
}
