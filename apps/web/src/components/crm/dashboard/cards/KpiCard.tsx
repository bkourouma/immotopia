import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Card, Statistic, Typography } from 'antd';
import { 
  RiseOutlined, 
  FallOutlined, 
  MinusOutlined 
} from '@ant-design/icons';
import { KpiValue } from '../../../../types/crmDashboard';

const { Text } = Typography;

interface KpiCardProps {
  title: string;
  icon: React.ReactNode;
  iconColor?: string;
  value: KpiValue;
  onClick?: () => void;
  delay?: number;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  icon,
  iconColor = '#1890ff',
  value,
  onClick,
  delay = 0,
}) => {
  const hasDelta = value.delta !== undefined && value.delta !== null;
  const isPositive = hasDelta && value.delta! > 0;
  const isNegative = hasDelta && value.delta! < 0;

  // Format number
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

  const DeltaIcon = isPositive ? RiseOutlined : isNegative ? FallOutlined : MinusOutlined;
  const deltaColor = isPositive ? '#52c41a' : isNegative ? '#ff4d4f' : '#8c8c8c';

  // Format delta text
  const deltaText = hasDelta
    ? `${Math.abs(value.delta!)}${value.deltaPercent !== undefined ? ` (${value.deltaPercent > 0 ? '+' : ''}${value.deltaPercent.toFixed(1)}%)` : ''}`
    : '';

  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <Statistic
        title={title}
        value={formatValue(value.value)}
        prefix={icon}
        valueStyle={{ color: iconColor }}
      />
      
      {hasDelta && (
        <div style={{ marginTop: 8 }}>
          <Text 
            type={isPositive ? 'success' : isNegative ? 'danger' : 'secondary'}
            style={{ fontSize: 12 }}
          >
            <DeltaIcon style={{ marginRight: 4 }} />
            {deltaText}
          </Text>
        </div>
      )}

      {/* Sparkline */}
      {value.trend && value.trend.length > 0 && (
        <div style={{ marginTop: 16, height: 40, width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={deltaColor}
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
    </Card>
  );
};





