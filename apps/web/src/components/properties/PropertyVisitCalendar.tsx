import React, { useState, useEffect } from 'react';
import {
  Card,
  Tag,
  Space,
  Typography,
  Empty,
  Spin,
  Divider,
} from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  ProjectOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { PropertyVisit } from '../../types/property-types';
import { getCalendarVisits } from '../../services/property-service';
import { Link } from 'react-router-dom';
import { getDealTypeLabel } from '../../utils/crm-utils';

const { Text, Title } = Typography;

interface PropertyVisitCalendarProps {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  assignedToUserId?: string;
}

export const PropertyVisitCalendar: React.FC<PropertyVisitCalendarProps> = ({
  tenantId,
  startDate,
  endDate,
  assignedToUserId,
}) => {
  const [visitsByDate, setVisitsByDate] = useState<Record<string, PropertyVisit[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVisits();
  }, [tenantId, startDate, endDate, assignedToUserId]);

  const loadVisits = async () => {
    setLoading(true);
    try {
      const start = startDate || new Date();
      const end = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const response = await getCalendarVisits(
        tenantId,
        start.toISOString(),
        end.toISOString(),
        assignedToUserId
      );
      setVisitsByDate(response);
    } catch (error) {
      console.error('Error loading calendar visits:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
      SCHEDULED: {
        label: 'Planifié',
        color: 'blue',
        icon: <ClockCircleOutlined />,
      },
      CONFIRMED: {
        label: 'Confirmé',
        color: 'green',
        icon: <CheckCircleOutlined />,
      },
      DONE: {
        label: 'Terminé',
        color: 'default',
        icon: <CheckCircleOutlined />,
      },
      NO_SHOW: {
        label: 'Absent',
        color: 'orange',
        icon: <CloseCircleOutlined />,
      },
      CANCELED: {
        label: 'Annulé',
        color: 'red',
        icon: <CloseCircleOutlined />,
      },
    };

    const config = statusConfig[status] || statusConfig.SCHEDULED;

    return (
      <Tag color={config.color} icon={config.icon}>
        {config.label}
      </Tag>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">Chargement des visites...</Text>
        </div>
      </div>
    );
  }

  const dates = Object.keys(visitsByDate).sort();

  if (dates.length === 0) {
    return (
      <Empty
        image={<CalendarOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
        description={
          <Space direction="vertical" size="small">
            <Title level={4} style={{ margin: 0 }}>
              Aucune visite planifiée
            </Title>
            <Text type="secondary">
              Aucune visite n'est planifiée pour cette période
            </Text>
          </Space>
        }
      />
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {dates.map((date) => (
        <Card
          key={date}
          title={
            <Title level={4} style={{ margin: 0 }}>
              {formatDate(date)}
            </Title>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {visitsByDate[date].map((visit, index) => (
              <React.Fragment key={visit.id}>
                {index > 0 && <Divider style={{ margin: '12px 0' }} />}
                <Card
                  size="small"
                  hoverable
                  style={{ border: '1px solid #f0f0f0' }}
                >
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    {/* Time and Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <Space>
                        <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
                        <Text strong>{formatTime(visit.scheduledAt)}</Text>
                        {visit.duration && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            ({visit.duration} min)
                          </Text>
                        )}
                      </Space>
                      {getStatusTag(visit.status)}
                    </div>

                    {/* Property */}
                    <div>
                      <Link
                        to={`/tenant/${tenantId}/properties/${visit.propertyId}`}
                        style={{ fontSize: 16, fontWeight: 500 }}
                      >
                        {visit.property?.title || visit.property?.address || 'Propriété'}
                      </Link>
                      {visit.location && (
                        <div style={{ marginTop: 4 }}>
                          <Space size="small">
                            <EnvironmentOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {visit.location}
                            </Text>
                          </Space>
                        </div>
                      )}
                    </div>

                    {/* Contact and Deal */}
                    <Space direction="vertical" size="small" style={{ fontSize: 12 }}>
                      {visit.contact && (
                        <Space size="small">
                          <UserOutlined style={{ color: '#8c8c8c' }} />
                          <Text type="secondary">
                            {visit.contact.firstName} {visit.contact.lastName}
                          </Text>
                        </Space>
                      )}
                      {visit.deal && (
                        <Space size="small">
                          <ProjectOutlined style={{ color: '#8c8c8c' }} />
                          <Text type="secondary">
                            {getDealTypeLabel(visit.deal.type)}
                          </Text>
                        </Space>
                      )}
                    </Space>

                    {/* Notes */}
                    {visit.notes && (
                      <div style={{ marginTop: 8, padding: 8, backgroundColor: '#fafafa', borderRadius: 4 }}>
                        <Space size="small">
                          <FileTextOutlined style={{ color: '#8c8c8c' }} />
                          <Text style={{ fontSize: 12 }}>{visit.notes}</Text>
                        </Space>
                      </div>
                    )}
                  </Space>
                </Card>
              </React.Fragment>
            ))}
          </Space>
        </Card>
      ))}
    </Space>
  );
};
