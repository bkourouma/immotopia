import React from 'react';
import { Tag } from 'antd';
import { MaintenanceTicketStatus } from '../../types/maintenance-types';
import { t } from '../../i18n/t';
import { localizedRecord } from '../../i18n/localized';

interface TicketStatusBadgeProps {
  status: MaintenanceTicketStatus;
}

const statusConfig: Record<MaintenanceTicketStatus, { color: string; label: string }> = localizedRecord(() => ({
  DECLARED: { color: 'default', label: t('Déclaré') },
  IN_PROGRESS: { color: 'processing', label: t('En cours') },
  ASSIGNED: { color: 'warning', label: t('Assigné') },
  RESOLVED: { color: 'success', label: t('Résolu') },
  CANCELED: { color: 'error', label: t('Annulé') }
}));

export const TicketStatusBadge: React.FC<TicketStatusBadgeProps> = ({ status }) => {
  const config = statusConfig[status];
  return <Tag color={config.color}>{config.label}</Tag>;
};
