import React from 'react';
import { useParams } from 'react-router-dom';
import { DealDetail } from '../../components/crm/DealDetail';
import { t } from '../../i18n/t';

export const DealDetailPage: React.FC = () => {
  const { tenantId, dealId } = useParams<{ tenantId: string; dealId: string }>();

  if (!tenantId || !dealId) {
    return <div>{t('Invalid route parameters')}</div>;
  }

  return (
    <>
      <DealDetail tenantId={tenantId} dealId={dealId} />
    </>
  );
};
