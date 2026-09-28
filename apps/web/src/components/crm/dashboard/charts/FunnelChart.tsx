import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card } from 'antd';
import { ConversionFunnel, FunnelStep } from '../../../../types/crmDashboard';
import { t } from '../../../../i18n/t';

interface FunnelChartProps {
  data: ConversionFunnel;
  onStepClick?: (step: string) => void;
}

/** Étapes renvoyées par l'API (clés techniques en anglais) : libellé affiché. */
function funnelStepLabel(step: string): string {
  const labels: Record<string, string> = {
    Leads: t('Prospects'),
    Qualified: t('Qualifié'),
    Visit: t('Visite'),
    Negotiation: t('Négociation'),
    Won: t('Gagné')
  };
  return labels[step] || step;
}

const STEP_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#64748b'];

export const FunnelChart: React.FC<FunnelChartProps> = ({ data, onStepClick }) => {
  // Create a funnel visualization using a horizontal bar chart
  // Sort steps by percentage descending to show funnel shape
  const chartData = [...data.steps]
    .sort((a, b) => b.percentage - a.percentage)
    .map((step, index) => ({
      ...step,
      label: funnelStepLabel(step.step),
      fill: STEP_COLORS[index % STEP_COLORS.length]
    }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: FunnelStep = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="font-semibold">{funnelStepLabel(data.step)}</p>
          <p className="text-sm text-slate-600">
            {t('Nombre')} : {data.count}
          </p>
          <p className="text-sm text-slate-600">
            {t('Taux')} : {data.percentage.toFixed(1)}%
          </p>
          {data.dropOff !== undefined && (
            <p className={`text-sm ${data.dropOff > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {t('Perte')} : {data.dropOff > 0 ? '+' : ''}
              {data.dropOff.toFixed(1)}%
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card title={t('Entonnoir de conversion')}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 20, right: 30, left: 100, bottom: 20 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
          <YAxis dataKey="label" type="category" width={80} tick={{ fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="percentage"
            name={t('Pourcentage')}
            radius={[0, 8, 8, 0]}
            cursor={onStepClick ? 'pointer' : 'default'}
            onClick={(data: any, index: number, e: any) => {
              // Handle different event structures from Recharts
              const step = data?.step || e?.payload?.step || data?.payload?.step;
              if (step && onStepClick) {
                onStepClick(step);
              }
            }}
            isAnimationActive
            animationDuration={1000}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
