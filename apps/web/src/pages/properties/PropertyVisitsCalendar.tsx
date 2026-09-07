import React from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Typography,
  Space,
} from 'antd';
import {
  CalendarOutlined,
} from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { PropertyVisitCalendar } from '../../components/properties/PropertyVisitCalendar';
import { useAuth } from '../../hooks/useAuth';

const { Title, Text } = Typography;

export const PropertyVisitsCalendar: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  if (!effectiveTenantId) {
    return (
      <DashboardLayout>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Text type="secondary">Aucun tenant sélectionné</Text>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Page Header */}
        <div>
          <Title level={2} style={{ margin: 0 }}>
            <CalendarOutlined /> Calendrier des visites
          </Title>
          <Text type="secondary">
            Consultez toutes les visites de propriétés planifiées
          </Text>
        </div>

        {/* Calendar */}
        <Card>
          <PropertyVisitCalendar tenantId={effectiveTenantId} />
        </Card>
      </Space>
    </DashboardLayout>
  );
};
