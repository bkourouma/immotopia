import React, { useState, useEffect, useMemo } from 'react';
import { Card, Space, Typography, Spin, Alert, Empty, Row, Col, List, Tag, Button } from 'antd';
import { FileTextOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ownerPortalService } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import { ListSearch, StateBlock } from '../../components/primitives';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { useOwnerPropertyOptions } from './useOwnerPropertyOptions';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Title, Text } = Typography;

interface LeaseItem {
  id: string;
  propertyId?: string;
  propertyAddress: string;
  tenantName: string;
  startDate: string;
  endDate: string | null;
  monthlyRent: number;
  status: string;
}

interface LeasesData {
  leases: LeaseItem[];
  summary: {
    active: number;
    ended: number;
    suspended: number;
  };
}

// Stables : déclarés HORS du composant (le filtrage local reste mémoïsé).
const TEXTE_RECHERCHE = [(lease: LeaseItem) => lease.propertyAddress, (lease: LeaseItem) => lease.tenantName];
const ACCESSEURS = {
  status: (lease: LeaseItem) => lease.status,
  period: (lease: LeaseItem) => lease.startDate
};

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
  const { options: propertyOptions } = useOwnerPropertyOptions();

  useEffect(() => {
    loadLeases();
  }, []);

  const loadLeases = async () => {
    try {
      setLoading(true);
      setError(null);
      // Liste reçue en entier : la recherche se fait ici, l'appel part sans filtre.
      const response = await ownerPortalService.getLeases();
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

  const criteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Bien, locataire…') },
    {
      key: 'status',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: [
        { value: 'ACTIVE', label: t('Actif') },
        { value: 'ENDED', label: t('Terminé') },
        { value: 'SUSPENDED', label: t('Suspendu') },
        { value: 'CANCELED', label: t('Annulé') }
      ]
    },
    { key: 'propertyId', type: 'select', label: t('Propriété'), primary: true, options: propertyOptions },
    { key: 'period', type: 'dateRange', label: t('Début du bail') }
  ];

  // Le critère « Propriété » compare l’identifiant du bien (deux lots d’un même immeuble partagent l’adresse).
  const predicates = useMemo(
    () => ({
      propertyId: (lease: LeaseItem, value: unknown) => lease.propertyId === value
    }),
    []
  );

  const local = useLocalListSearch<LeaseItem>(data?.leases, {
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS,
    predicates
  });

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

      {/* Lease List */}
      <Card title={t('Liste des baux')}>
        {/* Recherche locale : la liste arrive en entier (résumé ci-dessus : tous les baux, hors recherche) */}
        <ListSearch {...local.searchProps} />
        {local.total > 0 ? (
          <List
            dataSource={local.pageItems}
            pagination={{
              current: local.page,
              pageSize: local.pageSize,
              total: local.total,
              onChange: local.dataViewProps.onPageChange,
              showSizeChanger: true
            }}
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
                      <Text type="secondary">
                        {t('Locataire :')} {lease.tenantName}
                      </Text>
                      <Text type="secondary">
                        {t('Du')} {formatDate(lease.startDate)} {t('au')}{' '}
                        {lease.endDate ? formatDate(lease.endDate) : t('Non définie')}
                      </Text>
                      <Text type="secondary">
                        {t('Loyer :')} {formatCurrency(lease.monthlyRent)} {t('/ mois')}
                      </Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : local.isFiltered ? (
          <StateBlock
            variant="no-results"
            actions={[{ label: t('Effacer les critères'), onClick: local.clear, primary: true }]}
          />
        ) : (
          <Empty description={t('Aucun bail disponible')} />
        )}
      </Card>
    </Space>
  );
}
