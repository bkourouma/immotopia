import React from 'react';
import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { CashPlanCategory, CashPlanLine, CashPlanMonth } from '../../../types/cash-plan-types';
import { t } from '../../../i18n/t';
import { MoneyValue } from '../../primitives';
import { categoryLabel, formatPlanMonth, noteLabel, sourceKindLabel } from './cash-plan-labels';

const { Text } = Typography;

interface Props {
  periods: CashPlanMonth[];
}

const amountCell = (value: number) => (value ? <MoneyValue value={value} currency={null} /> : <span>—</span>);

function categoryColumn(category: CashPlanCategory): ColumnsType<CashPlanMonth>[number] {
  return {
    title: categoryLabel(category),
    key: category,
    align: 'end',
    render: (_: unknown, period: CashPlanMonth) => amountCell(period.byCategory?.[category] ?? 0)
  };
}

function sourceDetail(line: CashPlanLine): string {
  const kind = sourceKindLabel(line.source.kind);
  return line.label ? `${kind} — ${line.label}` : kind;
}

const DetailLines: React.FC<{ lines: CashPlanLine[] }> = ({ lines }) => {
  if (lines.length === 0) return <Text type="secondary">{t('Aucun flux prévu ce mois-ci.')}</Text>;
  return (
    <Table<CashPlanLine>
      size="small"
      pagination={false}
      rowKey="id"
      dataSource={lines}
      aria-label={t('Détail des lignes du mois')}
      scroll={{ x: 'max-content' }}
      columns={[
        { title: t('Catégorie'), key: 'category', render: (_, line) => categoryLabel(line.category) },
        { title: t('Bien'), key: 'bien', render: (_, line) => line.propertyTitle || '—' },
        {
          title: t('Source'),
          key: 'source',
          render: (_, line) => (
            <>
              <div>{sourceDetail(line)}</div>
              {line.note ? <Text type="secondary">{noteLabel(line.note)}</Text> : null}
            </>
          )
        },
        {
          title: t('Montant'),
          key: 'amount',
          align: 'end',
          render: (_, line) => (
            <>
              <MoneyValue value={line.direction === 'OUT' ? -line.amount : line.amount} currency={null} />
              {line.indicative ? (
                <Tag color="gold" style={{ marginInlineStart: 8 }}>
                  {t('Estimation indicative')}
                </Tag>
              ) : null}
            </>
          )
        }
      ]}
    />
  );
};

/** Tableau mensuel : entrées, sorties, net, cumul ; chaque ligne se déplie sur ses sources. */
export const CashPlanTable: React.FC<Props> = ({ periods }) => {
  const columns: ColumnsType<CashPlanMonth> = [
    {
      title: t('Mois'),
      key: 'month',
      fixed: 'start',
      render: (_: unknown, period: CashPlanMonth) => formatPlanMonth(period.month, true)
    },
    {
      title: t('Entrées'),
      children: [categoryColumn('RENT'), categoryColumn('RENT_ARREARS')]
    },
    {
      title: t('Sorties'),
      children: [
        categoryColumn('LOAN'),
        categoryColumn('WORKS'),
        categoryColumn('RECURRING_EXPENSE'),
        categoryColumn('PROPERTY_TAX')
      ]
    },
    {
      title: t('Net'),
      key: 'net',
      align: 'end',
      render: (_: unknown, period: CashPlanMonth) => <MoneyValue value={period.net} currency={null} signed />
    },
    {
      title: t('Cumul'),
      key: 'cumulative',
      align: 'end',
      render: (_: unknown, period: CashPlanMonth) => <MoneyValue value={period.cumulative} currency={null} signed />
    }
  ];

  return (
    <Table<CashPlanMonth>
      rowKey="month"
      size="middle"
      pagination={false}
      dataSource={periods}
      columns={columns}
      scroll={{ x: 'max-content' }}
      aria-label={t('Plan de trésorerie mensuel')}
      expandable={{
        expandedRowRender: period => <DetailLines lines={period.lines} />,
        rowExpandable: () => true
      }}
    />
  );
};
