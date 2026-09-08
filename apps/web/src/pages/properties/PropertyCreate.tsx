import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Space, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { PropertyFormWizard } from '../../components/properties/PropertyFormWizard';
import { useAuth } from '../../hooks/useAuth';

const { Title, Text } = Typography;

export const PropertyCreate: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  if (!effectiveTenantId) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Text type="secondary">Aucune agence sélectionnée</Text>
        </div>
      </>
    );
  }

  const handleComplete = (propertyId: string) => {
    navigate(`/tenant/${effectiveTenantId}/properties/${propertyId}`);
  };

  const handleCancel = () => {
    navigate(`/tenant/${effectiveTenantId}/properties`);
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/tenant/${effectiveTenantId}/properties`)}>
            Retour
          </Button>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              Nouvelle propriété
            </Title>
            <Text type="secondary">Créez une nouvelle propriété immobilière</Text>
          </div>
        </div>

        {/* Wizard */}
        <PropertyFormWizard tenantId={effectiveTenantId} onComplete={handleComplete} onCancel={handleCancel} />
      </Space>
    </>
  );
};
