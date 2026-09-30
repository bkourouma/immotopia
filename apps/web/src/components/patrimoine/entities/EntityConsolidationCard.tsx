import React from 'react';
import { Alert, Card, Col, Row, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { EntityConsolidation } from '../../../types/patrimoine-entities-types';
import { StatCard, MoneyValue } from '../../primitives';
import { t } from '../../../i18n/t';
import { formatAsOf, formatYieldPercent } from '../patrimoine-format';

const { Text } = Typography;

/**
 * `<EntityConsolidationCard>` — vue consolidée d'une entité détentrice :
 * valeur, dette, capitaux nets, loyers, charges, mensualités, flux,
 * rendements, plus-value latente, biens « à venir ».
 */

export interface EntityConsolidationCardProps {
  data: EntityConsolidation;
}

export const EntityConsolidationCard: React.FC<EntityConsolidationCardProps> = ({ data }) => {
  const { totals, properties } = data;

  const columns: ColumnsType<EntityConsolidation['properties'][number]> = [
    {
      title: t('Bien'),
      dataIndex: 'title',
      key: 'title',
      render: (value: string, row) => (
        <span>
          {value} {row.pending && <Tag>{t('À venir')}</Tag>}
        </span>
      )
    },
    { title: t('Référence'), dataIndex: 'internalReference', key: 'internalReference' },
    {
      title: t('Quote-part'),
      dataIndex: 'sharePercent',
      key: 'sharePercent',
      align: 'end',
      render: (value: number) => `${value.toLocaleString('fr-FR')} %`
    },
    {
      title: t('Valeur estimée'),
      dataIndex: 'estimatedValue',
      key: 'estimatedValue',
      align: 'end',
      render: (value: number) => <MoneyValue value={value} />
    },
    {
      title: t('Dette restante'),
      dataIndex: 'outstandingDebt',
      key: 'outstandingDebt',
      align: 'end',
      render: (value: number) => <MoneyValue value={value} />
    },
    {
      title: t('Flux annuel'),
      dataIndex: 'annualCashFlow',
      key: 'annualCashFlow',
      align: 'end',
      render: (value: number) => <MoneyValue value={value} signed />
    },
    {
      title: t('Rendement brut'),
      dataIndex: 'grossYield',
      key: 'grossYield',
      align: 'end',
      render: (value: number) => formatYieldPercent(value)
    },
    {
      title: t('Rendement net'),
      dataIndex: 'netYield',
      key: 'netYield',
      align: 'end',
      render: (value: number) => formatYieldPercent(value)
    }
  ];

  return (
    <div>
      {totals.costBasisIncomplete && (
        <Alert
          type="warning"
          showIcon
          message={t('Coût de revient incomplet')}
          description={t(
            "Le rendement net-net et la plus-value latente ne peuvent pas être calculés : au moins un bien n'a pas de coût de revient renseigné."
          )}
          style={{ marginBottom: 'var(--space-4)' }}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 'var(--space-4)' }}>
        <Col xs={24} sm={12} md={6}>
          <StatCard label={t('Biens')} value={totals.propertiesCount} highlight />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard label={t('Valeur estimée')} value={<MoneyValue value={totals.estimatedValue} />} />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard label={t('Dette restante')} value={<MoneyValue value={totals.outstandingDebt} />} />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard label={t('Capitaux nets')} value={<MoneyValue value={totals.netEquity} />} tone="positive" />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard label={t('Loyers annuels')} value={<MoneyValue value={totals.annualRent} />} />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard label={t('Charges annuelles')} value={<MoneyValue value={totals.annualExpenses} />} />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard label={t('Mensualités annuelles')} value={<MoneyValue value={totals.annualLoanPayments} />} />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            label={t('Flux de trésorerie annuel')}
            value={<MoneyValue value={totals.annualCashFlow} signed />}
            tone={totals.annualCashFlow >= 0 ? 'positive' : 'danger'}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard label={t('Rendement brut')} value={formatYieldPercent(totals.grossYield)} />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard label={t('Rendement net')} value={formatYieldPercent(totals.netYield)} />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard label={t('Rendement net-net')} value={formatYieldPercent(totals.netNetYield)} />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <StatCard
            label={t('Plus-value latente')}
            value={totals.latentCapitalGain === null ? '—' : <MoneyValue value={totals.latentCapitalGain} signed />}
          />
        </Col>
      </Row>

      <Text type="secondary" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
        {t('Situation au {{date}}.', { date: formatAsOf(data.asOf) })}
      </Text>

      <Card>
        <Table
          rowKey={row => row.propertyId}
          columns={columns}
          dataSource={properties}
          pagination={false}
          size="middle"
          aria-label={t('Biens de la consolidation')}
          locale={{ emptyText: t('Aucun bien') }}
        />
      </Card>
    </div>
  );
};
