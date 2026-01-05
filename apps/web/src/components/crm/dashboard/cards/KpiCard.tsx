import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from '../../../ui/card';
import { KpiValue } from '../../../../types/crmDashboard';

interface KpiCardProps {
  title: string;
  icon: LucideIcon;
  iconColor?: string;
  value: KpiValue;
  onClick?: () => void;
  delay?: number;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  icon: Icon,
  iconColor = 'text-blue-600',
  value,
  onClick,
  delay = 0,
}) => {
  const hasDelta = value.delta !== undefined && value.delta !== null;
  const isPositive = hasDelta && value.delta! > 0;
  const isNegative = hasDelta && value.delta! < 0;

  // Format number with count-up animation support
  const formatValue = (val: number): string => {
    if (val >= 1000000) {
      return `${(val / 1000000).toFixed(1)}M`;
    }
    if (val >= 1000) {
      return `${(val / 1000).toFixed(1)}k`;
    }
    return val.toLocaleString('fr-FR');
  };

  // Prepare sparkline data
  const sparklineData = value.trend
    ? value.trend.map((v, i) => ({ value: v, index: i }))
    : [{ value: 0, index: 0 }];

  const DeltaIcon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
    >
      <Card
        className={`cursor-pointer transition-all hover:shadow-lg ${
          onClick ? 'hover:border-blue-300' : ''
        }`}
        onClick={onClick}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600 mb-2">{title}</p>
              <motion.p
                className="text-3xl font-bold text-slate-900"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: delay + 0.1 }}
              >
                {formatValue(value.value)}
              </motion.p>

              {hasDelta && (
                <div className="flex items-center mt-2">
                  <motion.div
                    className={`flex items-center gap-1 text-xs font-medium ${
                      isPositive
                        ? 'text-green-600'
                        : isNegative
                        ? 'text-red-600'
                        : 'text-slate-500'
                    }`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: delay + 0.2 }}
                  >
                    <DeltaIcon className="h-3 w-3" />
                    <span>
                      {Math.abs(value.delta!)} {value.deltaPercent !== undefined && `(${value.deltaPercent > 0 ? '+' : ''}${value.deltaPercent.toFixed(1)}%)`}
                    </span>
                  </motion.div>
                </div>
              )}
            </div>

            <div className={`bg-slate-100 rounded-full p-3 ${iconColor.replace('text-', 'bg-').replace('-600', '-100')}`}>
              <Icon className={`h-6 w-6 ${iconColor}`} />
            </div>
          </div>

          {/* Sparkline */}
          {value.trend && value.trend.length > 0 && (
            <div className="mt-4 h-[40px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={isPositive ? '#10b981' : isNegative ? '#ef4444' : '#64748b'}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={true}
                    animationDuration={1000}
                    animationEasing="ease-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};





