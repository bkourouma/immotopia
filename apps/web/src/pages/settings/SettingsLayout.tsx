import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';

export const SettingsLayout: React.FC = () => {
  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
};
