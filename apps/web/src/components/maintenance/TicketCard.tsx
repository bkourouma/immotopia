import React from 'react';
import { Card, Typography, Space, Tag, Button, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { Ticket, MaintenanceTicketStatus } from '../../types/maintenance-types';
import { TicketStatusBadge } from './TicketStatusBadge';
import { safeFormatDate } from '../../utils/date-utils';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

interface TicketCardProps {
  ticket: Ticket;
  onClick?: () => void;
  onEdit?: (ticketId: string) => void;
  onDelete?: (ticketId: string) => void;
}

const categoryLabels: Record<string, string> = {
  PLUMBING: 'Plomberie',
  ELECTRICITY: t('Électricité'),
  AC: 'Climatisation',
  OTHER: 'Autre'
};

const priorityLabels: Record<string, string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyenne',
  HIGH: t('Élevée'),
  URGENT: 'Urgente'
};

const priorityColors: Record<string, string> = {
  LOW: 'default',
  MEDIUM: 'processing',
  HIGH: 'warning',
  URGENT: 'error'
};

export const TicketCard: React.FC<TicketCardProps> = ({ ticket, onClick, onEdit, onDelete }) => {
  const formattedDate = safeFormatDate(ticket.createdAt, 'DD MMM YYYY', t('Date invalide'));
  const canEdit = ticket.status === MaintenanceTicketStatus.DECLARED;
  // Can delete permanently only if DECLARED or CANCELED
  const canDelete =
    ticket.status === MaintenanceTicketStatus.DECLARED || ticket.status === MaintenanceTicketStatus.CANCELED;

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(ticket.id);
    }
  };

  const handleDelete = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (onDelete) {
      onDelete(ticket.id);
    }
  };

  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', marginBottom: 16 }}
      actions={
        onEdit || onDelete
          ? [
              canEdit && onEdit ? (
                <Button key="edit" type="text" icon={<EditOutlined />} onClick={handleEdit} style={{ width: '100%' }}>
                  {t('Modifier')}
                </Button>
              ) : null,
              canDelete && onDelete ? (
                <Popconfirm
                  key="delete"
                  title={t('Supprimer définitivement le ticket')}
                  description={t(
                    'Êtes-vous sûr de vouloir supprimer définitivement ce ticket ? Cette action est irréversible.'
                  )}
                  onConfirm={handleDelete}
                  onCancel={e => e?.stopPropagation()}
                  okText={t('Oui, supprimer')}
                  cancelText={t('Non')}
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={e => e.stopPropagation()}
                    style={{ width: '100%' }}
                  >
                    {t('Supprimer')}
                  </Button>
                </Popconfirm>
              ) : null
            ].filter(Boolean)
          : undefined
      }
    >
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <div className="it-toolbar it-toolbar--start">
          <Title level={5} style={{ margin: 0, flex: 1 }}>
            {ticket.title}
          </Title>
          <TicketStatusBadge status={ticket.status} />
        </div>

        <div>
          <Tag>{categoryLabels[ticket.category] || ticket.category}</Tag>
          <Tag color={priorityColors[ticket.priority]}>{priorityLabels[ticket.priority] || ticket.priority}</Tag>
        </div>

        <Text type="secondary" ellipsis style={{ display: 'block' }}>
          {ticket.description}
        </Text>

        {ticket.property && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('Propriété:')} {ticket.property.address}
          </Text>
        )}

        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('Créé le')} {formattedDate}
        </Text>
      </Space>
    </Card>
  );
};
