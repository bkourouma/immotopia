import React from 'react';
import { Card, Progress, Table } from 'antd';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { NetWorthHistoryPoint, NetWorthResult } from '../../../services/patrimoine-assets-service';
import { t } from '../../../i18n/t';
import { activeLocale } from '../../../i18n/format';
import { ASSET_CLASS_COLORS, assetClassLabel } from './asset-classes';
import { formatAmount, formatShare } from './asset-format';
import { computeClassBreakdown, type ClassBreakdownRow } from './net-worth-helpers';

/** Répartition par classe : graphique en anneau et liste avec la part de chaque classe. */
export const ClassBreakdownCard: React.FC<{ result: NetWorthResult }> = ({ result }) => {
  const rows = computeClassBreakdown(result);
  return (
    <Card title={t('Répartition par classe')}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'center' }}>
        <div style={{ width: 220, height: 220, flex: '0 0 auto' }} aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                dataKey="value"
                nameKey="assetClass"
                innerRadius={55}
                outerRadius={95}
                isAnimationActive={false}
              >
                {rows.map(row => (
                  <Cell key={row.assetClass} fill={ASSET_CLASS_COLORS[row.assetClass]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <Table<ClassBreakdownRow>
          style={{ flex: '1 1 320px', minWidth: 0 }}
          size="small"
          rowKey="assetClass"
          pagination={false}
          dataSource={rows}
          scroll={{ x: 'max-content' }}
          columns={[
            {
              title: t('Classe'),
              dataIndex: 'assetClass',
              render: (value: ClassBreakdownRow['assetClass']) => (
                <span>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      marginInlineEnd: 8,
                      background: ASSET_CLASS_COLORS[value]
                    }}
                  />
                  {assetClassLabel(value)}
                </span>
              )
            },
            { title: t('Actifs'), dataIndex: 'count', align: 'end' },
            {
              title: t('Valeur'),
              dataIndex: 'value',
              align: 'end',
              render: (value: number) => formatAmount(value, 'XOF')
            },
            {
              title: t('Part'),
              dataIndex: 'share',
              render: (share: number) => (
                <div style={{ minWidth: 110 }}>
                  <Progress percent={Math.round(share * 1000) / 10} showInfo={false} size="small" />
                  <span>{formatShare(share)}</span>
                </div>
              )
            }
          ]}
        />
      </div>
    </Card>
  );
};

function monthLabel(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(activeLocale(), { month: 'short', year: '2-digit' });
}

/** Courbe d'évolution de la valeur nette (12 derniers mois par défaut côté serveur). */
export const NetWorthHistoryCard: React.FC<{ points: NetWorthHistoryPoint[] }> = ({ points }) => {
  const compact = (value: unknown) =>
    new Intl.NumberFormat(activeLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value ?? 0));
  const full = (value: unknown) => formatAmount(Number(Array.isArray(value) ? value[0] : (value ?? 0)), 'XOF');
  return (
    <Card title={t('Évolution de la valeur nette')}>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 20, left: 12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={monthLabel} />
            <YAxis width={70} tickFormatter={compact} />
            <Tooltip formatter={full} labelFormatter={label => monthLabel(String(label))} />
            <Legend />
            <Line
              type="monotone"
              dataKey="netWorth"
              name={t('Valeur nette')}
              stroke="#1677ff"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="totalAssets"
              name={t('Total des actifs')}
              stroke="#52c41a"
              strokeWidth={1}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="totalDebts"
              name={t('Total des dettes')}
              stroke="#f5222d"
              strokeWidth={1}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
