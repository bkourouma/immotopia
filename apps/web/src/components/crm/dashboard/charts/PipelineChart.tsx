import React from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { PipelineSummary, PipelineStageData } from '../../../../types/crmDashboard';
import { CrmDealStage } from '../../../../types/crm-types';

interface PipelineChartProps {
  data: PipelineSummary;
  onStageClick?: (stage: CrmDealStage) => void;
}

const STAGE_COLORS: Record<CrmDealStage, string> = {
  NEW: '#64748b',
  QUALIFIED: '#3b82f6',
  VISIT: '#f59e0b',
  NEGOTIATION: '#ef4444',
  WON: '#10b981',
  LOST: '#94a3b8',
};

const STAGE_LABELS: Record<CrmDealStage, string> = {
  NEW: 'Nouveau',
  QUALIFIED: 'Qualifié',
  VISIT: 'Visite',
  NEGOTIATION: 'Négociation',
  WON: 'Gagné',
  LOST: 'Perdu',
};

export const PipelineChart: React.FC<PipelineChartProps> = ({ data, onStageClick }) => {
  const chartData = data.stages.map((stage) => ({
    ...stage,
    label: STAGE_LABELS[stage.stage] || stage.stage,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: PipelineStageData = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="font-semibold">{STAGE_LABELS[data.stage] || data.stage}</p>
          <p className="text-sm text-slate-600">Nombre: {data.count}</p>
          <p className="text-sm text-slate-600">Valeur: {data.value.toLocaleString('fr-FR')} FCFA</p>
          <p className="text-sm text-slate-600">Âge moyen: {data.avgAgeDays.toFixed(0)} jours</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline des affaires</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <XAxis
              dataKey="label"
              angle={-45}
              textAnchor="end"
              height={80}
              tick={{ fontSize: 12 }}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar
              dataKey="count"
              name="Nombre d'affaires"
              radius={[8, 8, 0, 0]}
              cursor={onStageClick ? 'pointer' : 'default'}
              onClick={(data: any, index: number, e: any) => {
                // Handle different event structures from Recharts
                const stage = data?.stage || e?.payload?.stage || data?.payload?.stage;
                if (stage && onStageClick) {
                  onStageClick(stage);
                }
              }}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={STAGE_COLORS[entry.stage] || '#64748b'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

