import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Button, Space, Typography, App } from 'antd';
import { ArrowLeftOutlined, PictureOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { PropertyForm } from '../../components/properties/PropertyForm';
import { PropertyPublicationControls } from '../../components/properties/PropertyPublicationControls';
import { PropertyMediaUpload } from '../../components/properties/PropertyMediaUpload';
import { PropertyMediaGallery } from '../../components/properties/PropertyMediaGallery';
import { getProperty, updateProperty } from '../../services/property-service';
import { Property, UpdatePropertyRequest, PropertyMediaType } from '../../types/property-types';
import { useAuth } from '../../hooks/useAuth';
import { HelpButton } from '../../help';
import { SkeletonDetail } from '../../components/primitives/Skeleton';
import { StateBlock } from '../../components/primitives/StateBlock';
import { useConfirmAction } from '../../components/primitives/ConfirmAction';
import { apiErrorText } from '../../components/properties/property-api-errors';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

export const PropertyEdit: React.FC = () => {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { isDesktop } = useBreakpoint();
  const confirmer = useConfirmAction();
  // Vrai tant que le formulaire porte une saisie non enregistrée.
  const [modifie, setModifie] = useState(false);
  const { tenantId, id } = useParams<{ tenantId: string; id: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0);

  useEffect(() => {
    if (!effectiveTenantId || !id) {
      setError(t('Paramètres manquants'));
      setLoading(false);
      return;
    }

    loadProperty();
  }, [effectiveTenantId, id]);

  const loadProperty = async () => {
    if (!effectiveTenantId || !id) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getProperty(effectiveTenantId, id);
      setProperty(data);
    } catch (err: any) {
      setError(apiErrorText(err, t('Erreur lors du chargement de la propriété')));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data: UpdatePropertyRequest) => {
    if (!effectiveTenantId || !id) return;

    try {
      await updateProperty(effectiveTenantId, id, data);
      setModifie(false);
      message.success(t('Bien mis à jour'));
      navigate(`/tenant/${effectiveTenantId}/properties/${id}`);
    } catch (error) {
      console.error('Error updating property:', error);
      throw error;
    }
  };

  // « Retour » ne perd jamais une modification en silence.
  const handleBack = () => {
    if (!modifie) {
      handleCancel();
      return;
    }
    confirmer({
      title: t('Abandonner les modifications ?'),
      description: t('Les changements non enregistrés seront perdus.'),
      okText: t('Abandonner les modifications'),
      cancelText: t('Continuer la saisie'),
      danger: true,
      onConfirm: handleCancel
    });
  };

  const handleCancel = () => {
    if (!effectiveTenantId || !id) return;
    navigate(`/tenant/${effectiveTenantId}/properties/${id}`);
  };

  if (!effectiveTenantId) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Text type="secondary">{t('Aucune agence sélectionnée')}</Text>
        </div>
      </>
    );
  }

  if (loading && !property) {
    return <SkeletonDetail rows={8} aria-label={t('Chargement de la propriété')} />;
  }

  if (!property) {
    return (
      <StateBlock
        variant="error"
        title={t('Impossible de charger ce bien')}
        description={error || t('Propriété non trouvée')}
        onRetry={() => void loadProperty()}
        actions={[
          { label: t('Retour à la liste'), onClick: () => navigate(`/tenant/${effectiveTenantId}/properties`) }
        ]}
      />
    );
  }

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            style={isDesktop ? undefined : { minHeight: 44 }}
            aria-label={t('Retour à la fiche du bien')}
          >
            {t('Retour')}
          </Button>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              {t('Modifier la propriété')}
            </Title>
            <Text type="secondary">{property.title}</Text>
          </div>
        </div>

        {/* Publication Controls */}
        {property && effectiveTenantId && (
          <PropertyPublicationControls property={property} tenantId={effectiveTenantId} onUpdate={loadProperty} />
        )}

        {/* Form */}
        <Card>
          <PropertyForm
            property={property}
            tenantId={effectiveTenantId}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            onDirtyChange={setModifie}
          />
        </Card>

        {/* Media Section */}
        <Card
          title={
            <Space>
              <PictureOutlined />
              {t('Photos et Vidéos')}
              <HelpButton helpId="commercial.biens.modifier.medias" size="small" />
            </Space>
          }
        >
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Photos Section */}
            <div>
              <Space style={{ marginBottom: 16 }}>
                <PictureOutlined />
                <Text strong>{t('Photos')}</Text>
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
                <Text strong>{t('Vidéos')}</Text>
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
    </>
  );
};
