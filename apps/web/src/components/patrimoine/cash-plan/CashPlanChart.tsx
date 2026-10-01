import React, { useMemo } from 'react';
import { Card } from 'antd';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { CashPlanData } from '../../../types/cash-plan-types';
import { t } from '../../../i18n/t';
import { formatMoney } from '../../primitives';
import { formatPlanMonth } from './cash-plan-labels';

interface Props {
  plan: CashPlanData;
}

const formatValue = (value: unknown): string => {
  const raw = Array.isArray(value) ? value[0] : value;
  return formatMoney(Number(raw ?? 0), { currency: null });
};

/**
 * Entrées et sorties par mois (barres) et cumul de trésorerie (courbe).
 * Le tableau mensuel juste en dessous porte les mêmes valeurs en texte.
 */
export const CashPlanChart: React.FC<Props> = ({ plan }) => {
  const data = useMemo(
    () =>
      plan.periods.map(period => ({
        label: formatPlanMonth(period.month),
        inflows: period.inflows,
        outflows: period.outflows,
        cumulative: period.cumulative
      })),
    [plan.periods]
  );

  const first = plan.periods[0];
  const last = plan.periods[plan.periods.length - 1];
  const summary = t(
    'Graphique des entrées et sorties mensuelles et du cumul de trésorerie, de {{debut}} à {{fin}}. Les mêmes valeurs figurent dans le tableau mensuel ci-dessous.',
    { debut: first ? formatPlanMonth(first.month) : '—', fin: last ? formatPlanMonth(last.month) : '—' }
  );

  return (
    <Card title={t('Entrées, sorties et cumul')}>
      <div role="img" aria-label={summary} style={{ width: '100%', height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis width={96} tickMargin={8} tickFormatter={formatValue} />
            <Tooltip formatter={formatValue} />
            <Legend />
            <ReferenceLine y={0} stroke="#8c8c8c" />
            <Bar dataKey="inflows" name={t('Entrées')} fill="#52c41a" />
            <Bar dataKey="outflows" name={t('Sorties')} fill="#fa8c16" />
            <Line
              type="monotone"
              dataKey="cumulative"
              name={t('Cumul de trésorerie')}
              stroke="#1677ff"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
