import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Space, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { PropertyFormWizard } from '../../components/properties/PropertyFormWizard';
import { useConfirmAction } from '../../components/primitives/ConfirmAction';
import { useAuth } from '../../hooks/useAuth';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

export const PropertyCreate: React.FC = () => {
  const navigate = useNavigate();
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const { isDesktop } = useBreakpoint();
  const confirmer = useConfirmAction();
  // Vrai tant que l'assistant porte une saisie non enregistrée.
  const [modifie, setModifie] = useState(false);
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  if (!effectiveTenantId) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Text type="secondary">{t('Aucune agence sélectionnée')}</Text>
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

  // Le lien « Retour » ne perd jamais une saisie en silence.
  const handleBack = () => {
    if (!modifie) {
      handleCancel();
      return;
    }
    confirmer({
      title: t('Abandonner la saisie de ce bien ?'),
      description: t('Les informations saisies et non enregistrées seront perdues.'),
      okText: t('Abandonner la saisie'),
      cancelText: t('Continuer la saisie'),
      danger: true,
      onConfirm: handleCancel
    });
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            style={isDesktop ? undefined : { minHeight: 44 }}
            aria-label={t('Retour à la liste des biens')}
          >
            {t('Retour')}
          </Button>
          <div style={{ minWidth: 0, flex: '1 1 240px' }}>
            <Title level={2} style={{ margin: 0 }}>
              {t('Nouvelle propriété')}
            </Title>
            <Text type="secondary">{t('Créez une nouvelle propriété immobilière')}</Text>
          </div>
        </div>

        {/* Wizard */}
        <PropertyFormWizard
          tenantId={effectiveTenantId}
          onComplete={handleComplete}
          onCancel={handleCancel}
          onDirtyChange={setModifie}
        />
      </Space>
    </>
  );
};
