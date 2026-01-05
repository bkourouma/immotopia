import React from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { Settings } from 'lucide-react';

export const TenantSettings: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Paramètres du Tenant</h1>
          <p className="mt-2 text-sm text-slate-600">Gérez les paramètres de votre tenant</p>
        </div>

        {/* Settings Content */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-12">
            <Settings className="h-12 w-12 text-gray-400 mx-auto" />
            <p className="mt-4 text-gray-600">Page de paramètres à implémenter</p>
            <p className="text-sm text-gray-500">Tenant ID: {tenantId}</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};





