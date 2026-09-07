import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Typography,
  Alert,
  Spin,
} from 'antd';
import {
  ArrowLeftOutlined,
  PictureOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { PropertyForm } from '../../components/properties/PropertyForm';
import { PropertyPublicationControls } from '../../components/properties/PropertyPublicationControls';
import { PropertyMediaUpload } from '../../components/properties/PropertyMediaUpload';
import { PropertyMediaGallery } from '../../components/properties/PropertyMediaGallery';
import { getProperty, updateProperty } from '../../services/property-service';
import { Property, UpdatePropertyRequest, PropertyMediaType } from '../../types/property-types';
import { useAuth } from '../../hooks/useAuth';

const { Title, Text } = Typography;

export const PropertyEdit: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId, id } = useParams<{ tenantId: string; id: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0);

  useEffect(() => {
    if (!effectiveTenantId || !id) {
      setError('Paramètres manquants');
      setLoading(false);
      return;
    }

    loadProperty();
  }, [effectiveTenantId, id]);

  const loadProperty = async () => {
    if (!effectiveTenantId || !id) return;

    try {
      setLoading(true);
      const data = await getProperty(effectiveTenantId, id);
      setProperty(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du chargement de la propriété');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data: UpdatePropertyRequest) => {
    if (!effectiveTenantId || !id) return;

    try {
      await updateProperty(effectiveTenantId, id, data);
      navigate(`/tenant/${effectiveTenantId}/properties/${id}`);
    } catch (error) {
      console.error('Error updating property:', error);
      throw error;
    }
  };

  const handleCancel = () => {
    if (!effectiveTenantId || !id) return;
    navigate(`/tenant/${effectiveTenantId}/properties/${id}`);
  };

  if (!effectiveTenantId) {
    return (
      <DashboardLayout>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Text type="secondary">Aucun tenant sélectionné</Text>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <Spin size="large" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !property) {
    return (
      <DashboardLayout>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Alert
            message="Erreur"
            description={error || 'Propriété non trouvée'}
            type="error"
            showIcon
            action={
              <Button onClick={() => navigate(`/tenant/${effectiveTenantId}/properties`)}>
                Retour à la liste
              </Button>
            }
          />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/tenant/${effectiveTenantId}/properties/${id}`)}
          >
            Retour
          </Button>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              Modifier la propriété
            </Title>
            <Text type="secondary">{property.title}</Text>
          </div>
        </div>

        {/* Publication Controls */}
        {property && effectiveTenantId && (
          <PropertyPublicationControls
            property={property}
            tenantId={effectiveTenantId}
            onUpdate={loadProperty}
          />
        )}

        {/* Form */}
        <Card>
          <PropertyForm
            property={property}
            tenantId={effectiveTenantId}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </Card>

        {/* Media Section */}
        <Card
          title={
            <Space>
              <PictureOutlined />
              Photos et Vidéos
            </Space>
          }
        >
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Photos Section */}
            <div>
              <Space style={{ marginBottom: 16 }}>
                <PictureOutlined />
                <Text strong>Photos</Text>
              </Space>
              <PropertyMediaUpload
                propertyId={id!}
                tenantId={effectiveTenantId}
                mediaType={PropertyMediaType.PHOTO}
                onUploadComplete={() => setMediaRefreshKey(prev => prev + 1)}
              />
              <div style={{ marginTop: 16 }}>
                <PropertyMediaGallery
                  propertyId={id!}
                  tenantId={effectiveTenantId}
                  mediaType={PropertyMediaType.PHOTO}
                  refreshTrigger={mediaRefreshKey}
                />
              </div>
            </div>

            {/* Videos Section */}
            <div>
              <Space style={{ marginBottom: 16 }}>
                <PlayCircleOutlined />
                <Text strong>Vidéos</Text>
              </Space>
              <PropertyMediaUpload
                propertyId={id!}
                tenantId={effectiveTenantId}
                mediaType={PropertyMediaType.VIDEO}
                onUploadComplete={() => setMediaRefreshKey(prev => prev + 1)}
              />
              <div style={{ marginTop: 16 }}>
                <PropertyMediaGallery
                  propertyId={id!}
                  tenantId={effectiveTenantId}
                  mediaType={PropertyMediaType.VIDEO}
                  refreshTrigger={mediaRefreshKey}
                />
              </div>
            </div>
          </Space>
        </Card>
      </Space>
    </DashboardLayout>
  );
};
