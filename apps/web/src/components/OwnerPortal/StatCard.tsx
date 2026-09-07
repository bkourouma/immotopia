import React from 'react';
import { Card, Statistic } from 'antd';
import { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  prefix?: ReactNode;
  suffix?: string;
  valueStyle?: React.CSSProperties;
  icon?: ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  prefix,
  suffix,
  valueStyle,
  icon
}) => {
  return (
    <Card>
      <Statistic
        title={title}
        value={value}
        prefix={prefix || icon}
        suffix={suffix}
        valueStyle={valueStyle}
      />
    </Card>
  );
};
