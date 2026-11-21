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
import { HelpSectionTitle } from '../../../help';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import { activeLocale } from '../../../i18n/format';
import { CHART_COLORS, CHART_SERIES, compactNumber, markerDot } from '../chart-palette';

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
  const { isMobile } = useBreakpoint();
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
    <Card title={<HelpSectionTitle title={t('Entrées, sorties et cumul')} helpId="patrimoine.tresorerie.graphique" />}>
      <div role="img" aria-label={summary} style={{ width: '100%', height: isMobile ? 280 : 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: isMobile ? 8 : 16, left: isMobile ? 0 : 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis
              width={isMobile ? 52 : 72}
              tickMargin={8}
              tickFormatter={value => compactNumber(value, activeLocale())}
            />
            <Tooltip formatter={formatValue} />
            <Legend wrapperStyle={{ whiteSpace: 'normal' }} />
            <ReferenceLine y={0} stroke={CHART_COLORS.grey} />
            <Bar dataKey="inflows" name={t('Entrées')} fill={CHART_COLORS.blue} />
            <Bar dataKey="outflows" name={t('Sorties')} fill={CHART_COLORS.orange} />
            <Line
              type="monotone"
              dataKey="cumulative"
              name={t('Cumul de trésorerie')}
              stroke={CHART_SERIES.quaternary.color}
              strokeDasharray={CHART_SERIES.quaternary.dash}
              strokeWidth={2}
              dot={markerDot(CHART_SERIES.quaternary.marker)}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
