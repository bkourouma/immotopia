import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { TimeSeries, TimeSeriesDataPoint } from '../../../../types/crmDashboard';
import { format } from 'date-fns';

interface TimeSeriesChartProps {
  data: TimeSeries;
  onDataPointClick?: (point: TimeSeriesDataPoint) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
        <p className="font-semibold mb-2">{format(new Date(label), 'PPp')}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ data, onDataPointClick }) => {
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  const chartData = data.data.map((point) => ({
    ...point,
    date: format(new Date(point.date), 'dd MMM'),
    dateFull: point.date,
  }));

  const metrics = [
    { key: 'activities', label: 'Suivis', color: '#3b82f6' },
    { key: 'appointments', label: 'RDV', color: '#8b5cf6' },
    { key: 'newLeads', label: 'Nouveaux leads', color: '#10b981' },
    { key: 'wonDeals', label: 'Affaires gagnées', color: '#f59e0b' },
  ];

  const handleClick = (chartData: any) => {
    if (onDataPointClick && chartData?.activePayload?.[0]?.payload) {
      const originalPoint = data.data.find(
        (p) => format(new Date(p.date), 'dd MMM') === chartData.activePayload[0].payload.date
      );
      if (originalPoint) {
        onDataPointClick(originalPoint);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Série temporelle</CardTitle>
          <div className="flex gap-2">
            {metrics.map((metric) => (
              <button
                key={metric.key}
                onClick={() =>
                  setSelectedMetric(selectedMetric === metric.key ? null : metric.key)
                }
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  selectedMetric === null || selectedMetric === metric.key
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {metric.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            onClick={handleClick}
            style={{ cursor: onDataPointClick ? 'pointer' : 'default' }}
          >
            <defs>
              {metrics.map((metric) => (
                <linearGradient key={metric.key} id={`color${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={metric.color} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={metric.color} stopOpacity={0.1} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {metrics.map((metric) => (
              <Area
                key={metric.key}
                type="monotone"
                dataKey={metric.key}
                name={metric.label}
                stroke={metric.color}
                fillOpacity={
                  selectedMetric === null || selectedMetric === metric.key ? 1 : 0.1
                }
                strokeWidth={selectedMetric === null || selectedMetric === metric.key ? 2 : 1}
                isAnimationActive
                animationDuration={1000}
              />
            ))}
            <Brush dataKey="date" height={30} stroke="#64748b" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

