import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { PropertyFormWizard } from '../../components/properties/PropertyFormWizard';
import { useAuth } from '../../hooks/useAuth';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';

export const PropertyCreate: React.FC = () => {
  const navigate = useNavigate();
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

  const handleComplete = (propertyId: string) => {
    navigate(`/tenant/${effectiveTenantId}/properties/${propertyId}`);
  };

  const handleCancel = () => {
    navigate(`/tenant/${effectiveTenantId}/properties`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={`/tenant/${effectiveTenantId}/properties`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Nouvelle propriété</h1>
              <p className="mt-2 text-sm text-slate-600">
                Créez une nouvelle propriété immobilière
              </p>
            </div>
          </div>
        </div>

        {/* Wizard */}
        <PropertyFormWizard
          tenantId={effectiveTenantId}
          onComplete={handleComplete}
          onCancel={handleCancel}
        />
      </div>
    </DashboardLayout>
  );
};

