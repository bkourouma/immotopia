import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Space, Table, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { BankOutlined, GoldOutlined, RiseOutlined, SyncOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { ownerPortalPatrimoineService } from '../../services/owner-portal-patrimoine-service';
import type { PatrimoineOverview, PatrimoineSummaryProperty } from '../../services/owner-portal-patrimoine-service';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import { StateBlock, formatMoney } from '../../components/primitives';
import { DASH, deviseAffichee, formatPercent, sharePercentLabel } from './owner-patrimoine-labels';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

/** 404 (`NotFoundError`) : vue masquée par l'agence — pas une erreur à afficher comme telle. */
function isHiddenOrNotFound(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 404;
}

function errorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { message?: string; error?: string } } } | null)?.response?.data;
  return data?.message || data?.error || fallback;
}

export default function Patrimoine() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PatrimoineOverview | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setHidden(false);
    try {
      const overview = await ownerPortalPatrimoineService.getPatrimoine();
      setData(overview);
    } catch (err) {
      if (isHiddenOrNotFound(err)) {
        setHidden(true);
      } else {
        setError(errorMessage(err, t('Erreur lors du chargement du patrimoine')));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading && !data) {
    return <StateBlock variant="loading" />;
  }

  if (hidden) {
    return (
      <StateBlock variant="empty" title={t('Vue indisponible')} description={t("Cette vue n'est pas disponible.")} />
    );
  }

  if (error) {
    return (
      <StateBlock
        variant="error"
        description={error}
        actions={[{ label: t('Réessayer'), onClick: () => void load(), primary: true }]}
      />
    );
  }

  if (!data) {
    return <StateBlock variant="empty" />;
  }

  const { sections, summary, properties } = data;

  const columns: ColumnsType<PatrimoineSummaryProperty> = [
    {
      title: t('Bien'),
      dataIndex: 'title',
      key: 'title',
      render: (_: string, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.title}</Text>
          <Text type="secondary">{record.address}</Text>
        </Space>
      )
    },
    {
      title: t('Quote-part'),
      dataIndex: 'ownerSharePercent',
      key: 'ownerSharePercent',
      render: (value: number | null) => sharePercentLabel(value)
    }
  ];

  if (sections.valuation) {
    columns.push(
      {
        title: t('Dernière valorisation'),
        key: 'valuation',
        render: (_: unknown, record) =>
          record.valuation
            ? formatMoney(record.valuation.estimatedValue, { currency: deviseAffichee(record.valuation.currency) })
            : DASH
      },
      {
        title: t('Plus-value latente'),
        key: 'latentCapitalGain',
        render: (_: unknown, record) =>
          record.latentCapitalGain === undefined
            ? DASH
            : record.latentCapitalGain === null
              ? t('Non renseigné')
              : formatMoney(record.latentCapitalGain, { currency: deviseAffichee(summary.currency) })
      }
    );
  }

  if (sections.yield) {
    columns.push(
      {
        title: t('Rendement brut'),
        key: 'grossYield',
        render: (_: unknown, record) => formatPercent(record.yield?.grossYield)
      },
      {
        title: t('Rendement net'),
        key: 'netYield',
        render: (_: unknown, record) => formatPercent(record.yield?.netYield)
      }
    );
    if (sections.loans) {
      columns.push({
        title: t('Rendement net-net'),
        key: 'netNetYield',
        render: (_: unknown, record) => formatPercent(record.yield?.netNetYield)
      });
    }
  }

  if (sections.loans) {
    columns.push({
      title: t('Capital restant dû'),
      key: 'loanSummary',
      render: (_: unknown, record) =>
        record.loanSummary
          ? formatMoney(record.loanSummary.remainingCapital, { currency: deviseAffichee(summary.currency) })
          : DASH
    });
  }

  columns.push({
    title: '',
    key: 'actions',
    render: (_: unknown, record) => (
      <Button type="link" onClick={() => navigate(`/owner/patrimoine/${record.id}`)}>
        {t('Voir le détail')}
      </Button>
    )
  });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Mon patrimoine')}</Title>
          <Text type="secondary">{t('Valorisation, rendements et emprunts de vos biens')}</Text>
        </div>
        <Button icon={<SyncOutlined />} onClick={() => void load()} loading={loading} aria-label={t('Actualiser')}>
          {t('Actualiser')}
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title={t('Nombre de biens')}
            value={summary.propertyCount}
            icon={<GoldOutlined style={{ color: '#722ed1' }} />}
            valueStyle={{ fontSize: 18 }}
          />
        </Col>
        {sections.valuation && (
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Valeur estimée (votre part)')}
              value={
                summary.totalEstimatedValue === undefined
                  ? DASH
                  : formatMoney(summary.totalEstimatedValue, { currency: deviseAffichee(summary.currency) })
              }
              icon={<GoldOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ fontSize: 18, color: '#1890ff' }}
            />
          </Col>
        )}
        {sections.valuation && (
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Plus-value latente')}
              value={
                summary.totalLatentCapitalGain === undefined
                  ? DASH
                  : summary.totalLatentCapitalGain === null
                    ? t('Non renseigné')
                    : formatMoney(summary.totalLatentCapitalGain, { currency: deviseAffichee(summary.currency) })
              }
              icon={<RiseOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ fontSize: 18, color: '#52c41a' }}
            />
          </Col>
        )}
        {sections.loans && (
          <Col xs={24} sm={12} lg={6}>
            <StatCard
              title={t('Capital restant dû')}
              value={
                summary.totalRemainingLoanCapital === undefined
                  ? DASH
                  : formatMoney(summary.totalRemainingLoanCapital, { currency: deviseAffichee(summary.currency) })
              }
              icon={<BankOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ fontSize: 18, color: '#faad14' }}
            />
          </Col>
        )}
      </Row>

      <Card title={t('Vos biens')}>
        {properties.length > 0 ? (
          <Table
            scroll={{ x: 'max-content' }}
            columns={columns}
            dataSource={properties}
            rowKey="id"
            pagination={{ pageSize: 10 }}
          />
        ) : (
          <StateBlock variant="empty" description={t('Aucun bien avec des données de patrimoine.')} />
        )}
      </Card>
    </Space>
  );
}
