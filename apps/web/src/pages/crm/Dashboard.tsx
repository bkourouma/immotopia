import React from 'react';
import { CrmDashboard as CrmDashboardComponent } from '../../components/crm/dashboard/CrmDashboard';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';

export const CrmDashboard: React.FC = () => {
  return (
    <DashboardLayout>
      <CrmDashboardComponent />
    </DashboardLayout>
  );
};

