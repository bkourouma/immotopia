import React from 'react';
import { useParams } from 'react-router-dom';
import { DealDetail } from '../../components/crm/DealDetail';

export const DealDetailPage: React.FC = () => {
  const { tenantId, dealId } = useParams<{ tenantId: string; dealId: string }>();

  if (!tenantId || !dealId) {
    return <div>Invalid route parameters</div>;
  }

  return (
    <>
      <DealDetail tenantId={tenantId} dealId={dealId} />
    </>
  );
};
