import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { LeaseForm } from '../../components/rental/LeaseForm';
import { LeaseFormWizard } from '../../components/rental/LeaseFormWizard';
import {
  createLease,
  updateLease,
  getLease,
  CreateLeaseRequest,
  UpdateLeaseRequest,
} from '../../services/rental-service';
import { useState, useEffect } from 'react';
import { RentalLease } from '../../services/rental-service';

export const LeaseFormPage: React.FC = () => {
  const { tenantId, leaseId } = useParams<{ tenantId: string; leaseId: string }>();
  const navigate = useNavigate();
  const [lease, setLease] = useState<RentalLease | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (leaseId && tenantId) {
      loadLease();
    }
  }, [leaseId, tenantId]);

  const loadLease = async () => {
    if (!tenantId || !leaseId) return;
    setLoading(true);
    try {
      const response = await getLease(tenantId, leaseId);
      if (response.success) {
        setLease(response.data);
      }
    } catch (error) {
      console.error('Error loading lease:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data: CreateLeaseRequest | UpdateLeaseRequest) => {
    if (!tenantId) return;

    try {
      if (leaseId) {
        await updateLease(tenantId, leaseId, data as UpdateLeaseRequest);
      } else {
        await createLease(tenantId, data as CreateLeaseRequest);
      }
      navigate(`/tenant/${tenantId}/rental/leases`);
    } catch (error) {
      throw error; // Let LeaseForm handle the error
    }
  };

  const handleCancel = () => {
    navigate(`/tenant/${tenantId}/rental/leases`);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-center py-8">Chargement...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">
            {leaseId ? 'Modifier le bail' : 'Nouveau bail'}
          </h1>
          <p className="text-muted-foreground">
            {leaseId ? 'Modifiez les informations du bail' : 'Créez un nouveau bail de location'}
          </p>
        </div>

        {leaseId ? (
          <div className="bg-white rounded-lg shadow p-6">
            <LeaseForm
              lease={lease || undefined}
              tenantId={tenantId!}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              loading={loading}
            />
          </div>
        ) : (
          <LeaseFormWizard
            tenantId={tenantId!}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            loading={loading}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

