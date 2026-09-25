import React, { useState, useEffect } from 'react';
import { Card, Select, Space, Typography, Spin, Alert, Empty, Row, Col, List, Tag, Button } from 'antd';
import { FileTextOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ownerPortalService } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;
const { Option } = Select;

interface LeasesData {
  leases: Array<{
    id: string;
    propertyAddress: string;
    tenantName: string;
    startDate: string;
    endDate: string | null;
    monthlyRent: number;
    status: string;
  }>;
  summary: {
    active: number;
    ended: number;
    suspended: number;
  };
}

function statusOptions() {
  return [
    { value: '', label: t('Tous les statuts') },
    { value: 'ACTIVE', label: t('Actif') },
    { value: 'ENDED', label: t('Terminé') },
    { value: 'SUSPENDED', label: t('Suspendu') },
    { value: 'CANCELED', label: t('Annulé') }
  ];
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat(activeLocale(), {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString(activeLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const getStatusTag = (status: string) => {
  const statusMap: Record<string, { label: string; color: string }> = {
    ACTIVE: { label: t('Actif'), color: 'success' },
    ENDED: { label: t('Terminé'), color: 'default' },
    SUSPENDED: { label: t('Suspendu'), color: 'warning' },
    CANCELED: { label: t('Annulé'), color: 'error' },
    DRAFT: { label: t('Brouillon'), color: 'default' }
  };
  const config = statusMap[status] || { label: status, color: 'default' };
  return <Tag color={config.color}>{config.label}</Tag>;
};

export default function Leases() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LeasesData | null>(null);
  const [filters, setFilters] = useState({
    status: '',
    propertyId: ''
  });

  useEffect(() => {
    loadLeases();
  }, [filters]);

  const loadLeases = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {};
      if (filters.status) params.status = filters.status;
      if (filters.propertyId) params.propertyId = filters.propertyId;

      const response = await ownerPortalService.getLeases(params);
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError(t('Erreur lors du chargement des baux'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement des baux'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement des baux...')} />
      </div>
    );
  }

  if (error) {
    return <Alert message={t('Erreur')} description={error} type="error" showIcon />;
  }

  if (!data) {
    return <Empty description={t('Aucun bail disponible')} />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Mes baux')}</Title>
          <Text type="secondary">{t('Gérez vos contrats de location')}</Text>
        </div>
        <Button icon={<SyncOutlined />} onClick={loadLeases} loading={loading} aria-label={t('Rafraîchir les baux')}>
          {t('Actualiser')}
        </Button>
      </div>

      {/* Lease Summary Cards (T055) */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title={t('Baux actifs')}
            value={data.summary.active}
            icon={<FileTextOutlined style={{ color: '#52c41a' }} />}
            valueStyle={{ fontSize: 24, color: '#52c41a' }}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title={t('Baux terminés')}
            value={data.summary.ended}
            icon={<FileTextOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ fontSize: 24, color: '#1890ff' }}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <StatCard
            title={t('Baux suspendus')}
            value={data.summary.suspended}
            icon={<FileTextOutlined style={{ color: '#faad14' }} />}
            valueStyle={{ fontSize: 24, color: '#faad14' }}
          />
        </Col>
      </Row>

      {/* Filters (T065) */}
      <Card title={t('Filtres')}>
        <Space wrap>
          <Select
            style={{ width: 200 }}
            placeholder={t('Statut')}
            value={filters.status || undefined}
            onChange={value => setFilters({ ...filters, status: value || '' })}
            allowClear
          >
            {statusOptions().map(opt => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>
        </Space>
      </Card>

      {/* Lease List */}
      <Card title={t('Liste des baux')}>
        {data.leases.length > 0 ? (
          <List
            dataSource={data.leases}
            renderItem={lease => (
              <List.Item
                actions={[
                  <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/owner/leases/${lease.id}`)}>
                    {t('Voir les détails')}
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>{lease.propertyAddress}</Text>
                      {getStatusTag(lease.status)}
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      <Text type="secondary">Locataire: {lease.tenantName}</Text>
                      <Text type="secondary">
                        {t('Du')} {formatDate(lease.startDate)} au{' '}
                        {lease.endDate ? formatDate(lease.endDate) : t('Non définie')}
                      </Text>
                      <Text type="secondary">Loyer: {formatCurrency(lease.monthlyRent)} / mois</Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description={t('Aucun bail trouvé avec ces filtres')} />
        )}
      </Card>
    </Space>
  );
}
