import React from 'react';
import { Timeline, Typography } from 'antd';
import { StatusHistory } from '../../types/maintenance-types';
import { formatTimelineDate } from '../../utils/date-utils';
import { t } from '../../i18n/t';

const { Text } = Typography;

interface TicketTimelineProps {
  statusHistory: StatusHistory[];
}

const statusLabels: Record<string, string> = {
  DECLARED: t('Déclaré'),
  IN_PROGRESS: t('En cours'),
  ASSIGNED: t('Assigné'),
  RESOLVED: t('Résolu'),
  CANCELED: t('Annulé')
};

export const TicketTimeline: React.FC<TicketTimelineProps> = ({ statusHistory }) => {
  if (statusHistory.length === 0) {
    return <Text type="secondary">{t('Aucun historique disponible')}</Text>;
  }

  const items = statusHistory.map((history, index) => {
    const formattedDate = formatTimelineDate(history.changedAt);
    const label = history.fromStatus
      ? `${statusLabels[history.fromStatus] || history.fromStatus} → ${statusLabels[history.toStatus] || history.toStatus}`
      : statusLabels[history.toStatus] || history.toStatus;

    return {
      children: (
        <div>
          <div style={{ fontWeight: 500 }}>{label}</div>
          {history.note && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              {history.note}
            </Text>
          )}
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
            {formattedDate}
            {history.changedByUser && ` par ${history.changedByUser.fullName || history.changedByUser.email}`}
            {!history.changedByUser && t('(Système)')}
          </Text>
        </div>
      ),
      color: index === statusHistory.length - 1 ? 'blue' : 'gray'
    };
  });

  return <Timeline items={items} />;
};
