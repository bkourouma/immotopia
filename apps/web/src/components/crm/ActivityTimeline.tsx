import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Empty, Space, Spin, Tag, Typography } from 'antd';
import {
  CalendarOutlined,
  EnvironmentOutlined,
  MailOutlined,
  MessageOutlined,
  PhoneOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { CrmActivity } from '../../types/crm-types';

const { Text, Paragraph } = Typography;

interface ActivityTimelineProps {
  activities: CrmActivity[];
  loading?: boolean;
  tenantId?: string;
  contactId?: string;
}

const TYPE_LABELS: Record<string, string> = {
  CALL: 'Appel',
  EMAIL: 'Email',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  VISIT: 'Visite',
  MEETING: 'Reunion',
  NOTE: 'Note',
  TASK: 'Tache',
  CORRECTION: 'Correction',
};

const TYPE_COLORS: Record<string, string> = {
  CALL: 'blue',
  EMAIL: 'green',
  SMS: 'cyan',
  WHATSAPP: 'green',
  VISIT: 'orange',
  MEETING: 'purple',
  NOTE: 'default',
  TASK: 'gold',
  CORRECTION: 'magenta',
};

function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type;
}

function getTypeColor(type: string): string {
  return TYPE_COLORS[type] || 'default';
}

function getTypeIcon(type: string): React.ReactNode {
  switch (type) {
    case 'CALL':
      return <PhoneOutlined />;
    case 'EMAIL':
      return <MailOutlined />;
    case 'SMS':
    case 'WHATSAPP':
      return <MessageOutlined />;
    case 'VISIT':
      return <EnvironmentOutlined />;
    case 'MEETING':
      return <TeamOutlined />;
    default:
      return <CalendarOutlined />;
  }
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  activities,
  loading = false,
  tenantId,
  contactId,
}) => {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <Spin />
        <div style={{ marginTop: 8 }}>
          <Text type="secondary">Chargement des activites...</Text>
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return <Empty description="Aucune activite" />;
  }

  const handleOpenActivities = (dealRelatedId?: string) => {
    if (!tenantId) return;
    const params = new URLSearchParams();
    if (contactId) params.set('contactId', contactId);
    if (dealRelatedId) params.set('dealId', dealRelatedId);
    navigate(`/tenant/${tenantId}/crm/activities?${params.toString()}`);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {activities.map((activity) => (
        <Card
          key={activity.id}
          size="small"
          hoverable={Boolean(tenantId)}
          onClick={() => handleOpenActivities(activity.deal?.id)}
          style={tenantId ? { cursor: 'pointer' } : undefined}
        >
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space wrap size={[8, 8]}>
              <Tag color={getTypeColor(activity.activityType)} icon={getTypeIcon(activity.activityType)}>
                {getTypeLabel(activity.activityType)}
              </Tag>
              {activity.direction ? <Tag>({activity.direction})</Tag> : null}
              {activity.correctionOfId ? <Tag color="gold">Correction</Tag> : null}
              <Text type="secondary">
                <CalendarOutlined /> {new Date(activity.occurredAt).toLocaleString('fr-FR')}
              </Text>
            </Space>

            {activity.subject ? <Text strong>{activity.subject}</Text> : null}
            <Paragraph style={{ marginBottom: 0 }}>{activity.content}</Paragraph>

            {activity.outcome ? (
              <Text type="secondary">
                <Text strong>Outcome:</Text> {activity.outcome}
              </Text>
            ) : null}

            <Space wrap size={[8, 8]}>
              {activity.contact ? (
                <Button
                  type="link"
                  size="small"
                  icon={<UserOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (tenantId && activity.contact?.id) {
                      navigate(`/tenant/${tenantId}/crm/contacts/${activity.contact.id}`);
                    }
                  }}
                  style={{ padding: 0 }}
                >
                  Contact: {activity.contact.firstName} {activity.contact.lastName}
                </Button>
              ) : null}

              {activity.deal ? (
                <Button
                  type="link"
                  size="small"
                  icon={<CalendarOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (tenantId && activity.deal?.id) {
                      navigate(`/tenant/${tenantId}/crm/deals/${activity.deal.id}`);
                    }
                  }}
                  style={{ padding: 0 }}
                >
                  Affaire: {activity.deal.type} - {activity.deal.stage}
                </Button>
              ) : null}

              {activity.createdBy ? (
                <Text type="secondary">
                  <UserOutlined /> Par: {activity.createdBy.fullName || activity.createdBy.email}
                </Text>
              ) : null}
            </Space>

            {activity.nextActionAt ? (
              <Tag color="processing">
                Action suivante: {activity.nextActionType || 'Follow-up'} le{' '}
                {new Date(activity.nextActionAt).toLocaleDateString('fr-FR')}
              </Tag>
            ) : null}
          </Space>
        </Card>
      ))}
    </Space>
  );
};
