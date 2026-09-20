import React from 'react';
import { Card, Empty, Space, Tag, Timeline, Typography } from 'antd';
import type { WorkProgram } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text } = Typography;

interface WorkProgramTimelineItem extends WorkProgram {
  propertyLabel?: string;
}

interface Props {
  items: WorkProgramTimelineItem[];
}

function statusColor(status: WorkProgram['status']): string {
  if (status === 'COMPLETED') return 'green';
  if (status === 'IN_PROGRESS') return 'blue';
  if (status === 'CANCELLED') return 'red';
  return 'orange';
}

function statusLabel(status: WorkProgram['status']): string {
  if (status === 'PLANNED') return t('Planifié');
  if (status === 'IN_PROGRESS') return t('En cours');
  if (status === 'COMPLETED') return t('Terminé');
  if (status === 'CANCELLED') return t('Annulé');
  return status;
}

export const WorkProgramTimeline: React.FC<Props> = ({ items }) => {
  const sorted = [...items].sort((a, b) => new Date(a.plannedDate).getTime() - new Date(b.plannedDate).getTime());

  return (
    <Card title={t('Programme de travaux')}>
      {sorted.length === 0 ? (
        <Empty description={t('Aucun programme de travaux')} />
      ) : (
        <Timeline
          items={sorted.map(item => ({
            color: statusColor(item.status),
            children: (
              <Space direction="vertical" size={2}>
                <Text strong>{item.title}</Text>
                {item.propertyLabel ? <Text type="secondary">{item.propertyLabel}</Text> : null}
                <Text type="secondary">
                  {new Date(item.plannedDate).toLocaleDateString(activeLocale())} -{' '}
                  {Number(item.estimatedCost).toLocaleString(activeLocale())} {item.currency}
                </Text>
                <Tag color={statusColor(item.status)}>{statusLabel(item.status)}</Tag>
              </Space>
            )
          }))}
        />
      )}
    </Card>
  );
};
