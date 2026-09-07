import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush } from 'recharts';
import { TimeSeries } from '../../../../types/crmDashboard';
import { format, parseISO } from 'date-fns';

interface TimeSeriesChartProps {
  data: TimeSeries;
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ data }) => {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['activities', 'newLeads', 'wonDeals']);

  const formatDate = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      if (data.period === 'day') {
        return format(date, 'dd MMM');
      } else if (data.period === 'week') {
        return format(date, 'dd MMM');
      } else {
        return format(date, 'MMM yyyy');
      }
    } catch {
      return dateString;
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{formatDate(label)}</p>
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

  const metricLabels: Record<string, string> = {
    activities: 'Activités',
    newLeads: 'Nouveaux leads',
    wonDeals: 'Affaires gagnées',
  };

  const metricColors: Record<string, string> = {
    activities: '#3b82f6',
    newLeads: '#10b981',
    wonDeals: '#f59e0b',
  };

  return (
    <div className="space-y-4">
      {/* Metric selector */}
      <div className="flex flex-wrap gap-2">
        {Object.keys(metricLabels).map((key) => (
          <button
            key={key}
            onClick={() => {
              setSelectedMetrics((prev) =>
                prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
              );
            }}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              selectedMetrics.includes(key)
                ? 'bg-blue-100 text-blue-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {metricLabels[key]}
          </button>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data.data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="#64748b"
            style={{ fontSize: '12px' }}
          />
          <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {selectedMetrics.map((metric) => (
            <Line
              key={metric}
              type="monotone"
              dataKey={metric}
              name={metricLabels[metric]}
              stroke={metricColors[metric]}
              strokeWidth={2}
              dot={false}
              isAnimationActive
              animationDuration={1000}
            />
          ))}
          <Brush
            dataKey="date"
            height={30}
            stroke="#64748b"
            tickFormatter={formatDate}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
