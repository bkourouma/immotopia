import { contactDisplayName } from '../../utils/contact-display';
import React, { useState, useEffect } from 'react';
import { Card, Tag, Space, Typography, Divider, Select } from 'antd';
import {
  ClockCircleOutlined,
  UserOutlined,
  TeamOutlined,
  ProjectOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { PropertyVisit } from '../../types/property-types';
import { getCalendarVisits } from '../../services/property-service';
import { listMembers, Member } from '../../services/membership-service';
import { Link } from 'react-router-dom';
import { getDealTypeLabel } from '../../utils/crm-utils';
import { HelpButton } from '../../help';
import { SkeletonList, StateBlock } from '../primitives';
import { apiErrorText } from './property-api-errors';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const { Text, Title } = Typography;

interface PropertyVisitCalendarProps {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  assignedToUserId?: string;
}

const PropertyVisitCalendarView: React.FC<PropertyVisitCalendarProps> = ({
  tenantId,
  startDate,
  endDate,
  assignedToUserId
}) => {
  const [visitsByDate, setVisitsByDate] = useState<Record<string, PropertyVisit[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadVisits();
  }, [tenantId, startDate, endDate, assignedToUserId]);

  const loadVisits = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const start = startDate || new Date();
      const end = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      const response = await getCalendarVisits(tenantId, start.toISOString(), end.toISOString(), assignedToUserId);
      setVisitsByDate(response);
    } catch (error) {
      console.error('Error loading calendar visits:', error);
      // Un calendrier vide ferait croire à un agenda libre : l'erreur le dit.
      setLoadError(apiErrorText(error, t('Impossible de charger les visites.')));
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
      SCHEDULED: {
        label: t('Planifié'),
        color: 'blue',
        icon: <ClockCircleOutlined />
      },
      CONFIRMED: {
        label: t('Confirmé'),
        color: 'green',
        icon: <CheckCircleOutlined />
      },
      DONE: {
        label: t('Terminé'),
        color: 'default',
        icon: <CheckCircleOutlined />
      },
      NO_SHOW: {
        label: t('Absent'),
        color: 'orange',
        icon: <CloseCircleOutlined />
      },
      CANCELED: {
        label: t('Annulé'),
        color: 'red',
        icon: <CloseCircleOutlined />
      }
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
    return date.toLocaleDateString(activeLocale(), {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(activeLocale(), {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <SkeletonList rows={3} aria-label={t('Chargement des visites...')} />;
  }

  if (loadError) {
    return (
      <StateBlock
        variant="error"
        title={t('Impossible de charger les visites')}
        description={loadError}
        actions={[{ label: t('Réessayer'), onClick: () => void loadVisits(), primary: true }]}
      />
    );
  }

  const dates = Object.keys(visitsByDate).sort();

  if (dates.length === 0) {
    return (
      <StateBlock
        variant="empty"
        title={t('Aucune visite planifiée')}
        description={t("Aucune visite n'est planifiée pour cette période")}
      />
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {dates.map(date => (
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
                <Card size="small" hoverable style={{ border: '1px solid #f0f0f0' }}>
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    {/* Time and Status */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8
                      }}
                    >
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
                        {visit.property?.title || visit.property?.address || t('Propriété')}
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
                      {(visit.assignedTo?.fullName || visit.assignedTo?.email) && (
                        <Space size="small">
                          <TeamOutlined style={{ color: '#8c8c8c' }} />
                          <Text type="secondary">
                            {t('Assigné à')} {visit.assignedTo.fullName || visit.assignedTo.email}
                          </Text>
                        </Space>
                      )}
                      {visit.contact && (
                        <Space size="small">
                          <UserOutlined style={{ color: '#8c8c8c' }} />
                          <Text type="secondary">{contactDisplayName(visit.contact)}</Text>
                        </Space>
                      )}
                      {visit.deal && (
                        <Space size="small">
                          <ProjectOutlined style={{ color: '#8c8c8c' }} />
                          <Text type="secondary">{getDealTypeLabel(visit.deal.type)}</Text>
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

/**
 * Calendrier des visites avec un filtre par collaborateur assigné : l'API
 * accepte `assignedToUserId`, la liste des collaborateurs vient des membres actifs.
 */
export const PropertyVisitCalendar: React.FC<PropertyVisitCalendarProps> = props => {
  const { tenantId, assignedToUserId } = props;
  const [members, setMembers] = useState<Member[]>([]);
  const [assignedFilter, setAssignedFilter] = useState<string | undefined>(assignedToUserId);

  useEffect(() => {
    let cancelled = false;
    listMembers(tenantId, { page: 1, limit: 500, status: 'ACTIVE' })
      .then(response => {
        if (!cancelled && response.success) setMembers(response.data.members || []);
      })
      .catch(() => {
        // Sans la liste, le filtre reste vide : le calendrier s'affiche quand même.
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space align="center" wrap>
        <Select
          allowClear
          showSearch
          style={{ minWidth: 260, maxWidth: '100%' }}
          placeholder={t('Filtrer par collaborateur')}
          aria-label={t('Filtrer par collaborateur')}
          value={assignedFilter}
          onChange={value => setAssignedFilter(value || undefined)}
          optionFilterProp="label"
          options={members.map(member => ({
            value: member.user.id,
            label: member.user.fullName || member.user.email
          }))}
        />
        <HelpButton helpId="commercial.biens.visites.calendrier" size="small" />
      </Space>
      <PropertyVisitCalendarView {...props} assignedToUserId={assignedFilter} />
    </Space>
  );
};
