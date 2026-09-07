import React from 'react';
import { Tag } from 'antd';
import { MaintenanceTicketStatus } from '../../types/maintenance-types';

interface TicketStatusBadgeProps {
  status: MaintenanceTicketStatus;
}

const statusConfig: Record<MaintenanceTicketStatus, { color: string; label: string }> = {
  DECLARED: { color: 'default', label: 'Déclaré' },
  IN_PROGRESS: { color: 'processing', label: 'En cours' },
  ASSIGNED: { color: 'warning', label: 'Assigné' },
  RESOLVED: { color: 'success', label: 'Résolu' },
  CANCELED: { color: 'error', label: 'Annulé' }
};

export const TicketStatusBadge: React.FC<TicketStatusBadgeProps> = ({ status }) => {
  const config = statusConfig[status];
  return <Tag color={config.color}>{config.label}</Tag>;
};
