import React, { useState, useEffect, useMemo } from 'react';
import { Space, Typography, Row, Col, Tag, Button } from 'antd';
import { FileTextOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ownerPortalService } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import { DataCard, DataView, PageHeader, SkeletonList, SkeletonStats, StateBlock } from '../../components/primitives';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { useOwnerPropertyOptions } from './useOwnerPropertyOptions';
import { t } from '../../i18n/t';

import { activeLocale, formatFcfa } from '../../i18n/format';
const { Text } = Typography;

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
  return formatFcfa(amount);
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

  const refreshButton = (
    <Button icon={<SyncOutlined />} onClick={loadLeases} loading={loading} aria-label={t('Rafraîchir les baux')}>
      {t('Actualiser')}
    </Button>
  );
  const header = (
    <PageHeader title={t('Mes baux')} subtitle={t('Gérez vos contrats de location')} extra={refreshButton} />
  );

  if (loading && !data) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {header}
        <SkeletonStats rows={3} aria-label={t('Chargement des baux')} />
        <SkeletonList rows={4} aria-label={t('Chargement des baux')} />
      </Space>
    );
  }

  if (error || !data) {
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {header}
        <StateBlock
          variant="error"
          title={t('Impossible de charger vos baux')}
          description={error ?? undefined}
          actions={[{ label: t('Réessayer'), onClick: loadLeases, primary: true }]}
        />
      </Space>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {header}

      {/* Lease Summary Cards (T055) : trois compteurs courts, cote a cote meme sur telephone */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <StatCard
            helpId="portails.proprietaire.baux.indicateurs"
            title={t('Baux actifs')}
            value={data.summary.active}
            icon={<FileTextOutlined style={{ color: '#52c41a' }} />}
            valueStyle={{ fontSize: 24, color: '#52c41a' }}
          />
        </Col>
        <Col xs={12} sm={8}>
          <StatCard
            title={t('Baux terminés')}
            value={data.summary.ended}
            icon={<FileTextOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ fontSize: 24, color: '#1890ff' }}
          />
        </Col>
        <Col xs={12} sm={8}>
          <StatCard
            title={t('Baux suspendus')}
            value={data.summary.suspended}
            icon={<FileTextOutlined style={{ color: '#faad14' }} />}
            valueStyle={{ fontSize: 24, color: '#faad14' }}
          />
        </Col>
      </Row>

      {/* Recherche locale : la liste arrive en entier (résumé ci-dessus : tous les baux, hors recherche).
          Cartes a toutes les largeurs : la carte entiere ouvre le bail. */}
      <DataView<LeaseItem>
        layout="grid"
        helpId="portails.proprietaire.baux.liste"
        aria-label={t('Liste des baux')}
        {...local.dataViewProps}
        export={false}
        emptyDescription={t('Aucun bail disponible')}
        rowKey={lease => lease.id}
        renderCard={lease => (
          <DataCard
            title={lease.propertyAddress}
            subtitle={t('Locataire : {{nom}}', { nom: lease.tenantName })}
            status={getStatusTag(lease.status)}
            highlight={t('{{montant}} / mois', { montant: formatCurrency(lease.monthlyRent) })}
            fields={[
              { label: t('Début'), value: formatDate(lease.startDate) },
              { label: t('Fin'), value: lease.endDate ? formatDate(lease.endDate) : t('Non définie') }
            ]}
            onOpen={() => navigate(`/owner/leases/${lease.id}`)}
            primaryAction={{
              label: t('Voir les détails'),
              icon: <EyeOutlined />,
              onClick: () => navigate(`/owner/leases/${lease.id}`)
            }}
          />
        )}
      />
    </Space>
  );
}
