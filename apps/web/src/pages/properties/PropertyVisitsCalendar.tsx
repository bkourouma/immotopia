import React from 'react';
import { useParams } from 'react-router-dom';
import { Card } from 'antd';
import { PropertyVisitCalendar } from '../../components/properties/PropertyVisitCalendar';
import { PageHeader, StateBlock } from '../../components/primitives';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/t';

export const PropertyVisitsCalendar: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  if (!effectiveTenantId) {
    return (
      <StateBlock
        variant="empty"
        title={t('Aucune agence sélectionnée')}
        description={t('Votre compte doit être rattaché à une agence pour consulter son portefeuille.')}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={t('Calendrier des visites')}
        subtitle={t('Consultez toutes les visites de propriétés planifiées')}
        breadcrumbs={[
          { label: t('Biens'), to: `/tenant/${effectiveTenantId}/properties` },
          { label: t('Calendrier des visites') }
        ]}
      />
      <Card>
        <PropertyVisitCalendar tenantId={effectiveTenantId} />
      </Card>
    </>
  );
};
