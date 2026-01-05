import React from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { DealDetail } from '../../components/crm/DealDetail';

export const DealDetailPage: React.FC = () => {
  const { tenantId, dealId } = useParams<{ tenantId: string; dealId: string }>();

  if (!tenantId || !dealId) {
    return <div>Invalid route parameters</div>;
  }

  return (
    <DashboardLayout>
      <DealDetail tenantId={tenantId} dealId={dealId} />
    </DashboardLayout>
  );
};





