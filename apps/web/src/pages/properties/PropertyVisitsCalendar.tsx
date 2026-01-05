import React from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { PropertyVisitCalendar } from '../../components/properties/PropertyVisitCalendar';
import { useAuth } from '../../hooks/useAuth';

export const PropertyVisitsCalendar: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { tenantMembership } = useAuth();
  const effectiveTenantId = tenantId || tenantMembership?.tenantId;

  if (!effectiveTenantId) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-slate-600">Aucun tenant sélectionné</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Calendrier des visites</h1>
          <p className="mt-2 text-sm text-slate-600">
            Consultez toutes les visites de propriétés planifiées
          </p>
        </div>

        {/* Calendar */}
        <PropertyVisitCalendar tenantId={effectiveTenantId} />
      </div>
    </DashboardLayout>
  );
};





