import React from 'react';
import { Alert, Collapse, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TaxComputation, TaxLine } from '../../../types/patrimoine-entities-types';
import { MoneyValue } from '../../primitives';
import { taxKindLabel, taxLineCodeLabel, taxReasonLabel, taxWarningLabel, parameterStatusLabel } from './tax-labels';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/**
 * `<TaxEstimateCard>` — détail d'une estimation fiscale (un ou plusieurs
 * `TaxComputation`) : totaux par impôt, lignes base/taux/abattement/montant,
 * bandeau de repli d'année, étiquette « À valider ».
 */

export interface TaxEstimateCardProps {
  computations: TaxComputation[];
  /** Année demandée, pour le bandeau de repli. */
  fiscalYear: number;
}

const lineColumns: ColumnsType<TaxLine> = [
  { title: t('Ligne'), dataIndex: 'code', key: 'code', render: (code: TaxLine['code']) => taxLineCodeLabel(code) },
  { title: t('Libellé'), dataIndex: 'label', key: 'label' },
  {
    title: t('Base'),
    dataIndex: 'base',
    key: 'base',
    align: 'end',
    render: (value: number | null) => (value === null ? '—' : <MoneyValue value={value} />)
  },
  {
    title: t('Taux'),
    dataIndex: 'rate',
    key: 'rate',
    align: 'end',
    render: (value: number | null) => (value === null ? '—' : `${value.toLocaleString('fr-FR')} %`)
  },
  {
    title: t('Montant'),
    dataIndex: 'amount',
    key: 'amount',
    align: 'end',
    render: (value: number) => <MoneyValue value={value} />
  },
  {
    title: t('Source'),
    dataIndex: 'source',
    key: 'source',
    render: (value: string | null, row) => (
      <span>
        {value ?? '—'}
        {row.status === 'A_VALIDER' && (
          <Tag color="warning" style={{ marginInlineStart: 'var(--space-2)' }}>
            {parameterStatusLabel('A_VALIDER')}
          </Tag>
        )}
      </span>
    )
  }
];

export const TaxEstimateCard: React.FC<TaxEstimateCardProps> = ({ computations, fiscalYear }) => {
  return (
    <div>
      {computations.some(computation => computation.parametersFallback) && (
        <Alert
          type="info"
          showIcon
          message={t(
            "Aucun paramètre fiscal pour {{annee}} : l'estimation utilise les derniers paramètres disponibles.",
            { annee: fiscalYear }
          )}
          style={{ marginBottom: 'var(--space-3)' }}
        />
      )}
      {computations.some(computation => !computation.allParametersValidated) && (
        <Alert
          type="warning"
          showIcon
          message={t('Certains paramètres utilisés sont « à valider ».')}
          style={{ marginBottom: 'var(--space-3)' }}
        />
      )}

      <Collapse
        defaultActiveKey={computations.map(computation => computation.taxKind)}
        items={computations.map(computation => ({
          key: computation.taxKind,
          label: (
            <span>
              {taxKindLabel(computation.taxKind)} —{' '}
              <Text strong>
                <MoneyValue value={computation.amountFull} />
              </Text>
              {!computation.applicable && computation.reason && (
                <Tag style={{ marginInlineStart: 'var(--space-2)' }}>{taxReasonLabel(computation.reason)}</Tag>
              )}
            </span>
          ),
          children: (
            <div>
              {computation.warnings.length > 0 && (
                <Text type="secondary" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                  {computation.warnings.map(warning => taxWarningLabel(warning)).join(' · ')}
                </Text>
              )}
              <Table
                rowKey={(line, index) => `${computation.taxKind}-${line.code}-${index}`}
                columns={lineColumns}
                dataSource={computation.lines}
                pagination={false}
                size="small"
                aria-label={t('Détail du calcul')}
                locale={{ emptyText: t('Aucune ligne de calcul') }}
              />
            </div>
          )
        }))}
      />
    </div>
  );
};
