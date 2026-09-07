import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { DealForm } from '../../components/crm/DealForm';
import { getDeal, createDeal, updateDeal, CrmDeal, CreateCrmDealRequest, UpdateCrmDealRequest } from '../../services/crm-service';

export const DealFormPage: React.FC = () => {
  const { tenantId, dealId } = useParams<{ tenantId: string; dealId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const contactId = searchParams.get('contactId');
  const [deal, setDeal] = useState<CrmDeal | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (dealId && tenantId) {
      loadDeal();
    }
  }, [dealId, tenantId]);

  const loadDeal = async () => {
    if (!tenantId || !dealId) return;
    setLoading(true);
    try {
      const response = await getDeal(tenantId, dealId);
      if (response.success) {
        setDeal(response.data);
      }
    } catch (error) {
      console.error('Error loading deal:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data: CreateCrmDealRequest | UpdateCrmDealRequest) => {
    if (!tenantId) return;
    try {
      if (dealId) {
        await updateDeal(tenantId, dealId, data as UpdateCrmDealRequest);
        navigate(`/tenant/${tenantId}/crm/deals/${dealId}`);
      } else {
        await createDeal(tenantId, data as CreateCrmDealRequest);
        // Si on vient d'un contact, rediriger vers le contact, sinon vers la liste des affaires
        if (contactId) {
          navigate(`/tenant/${tenantId}/crm/contacts/${contactId}`);
        } else {
          navigate(`/tenant/${tenantId}/crm/deals`);
        }
      }
    } catch (error) {
      throw error;
    }
  };

  const handleCancel = () => {
    if (dealId && tenantId) {
      navigate(`/tenant/${tenantId}/crm/deals/${dealId}`);
    } else if (contactId && tenantId) {
      navigate(`/tenant/${tenantId}/crm/contacts/${contactId}`);
    } else if (tenantId) {
      navigate(`/tenant/${tenantId}/crm/deals`);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-2 text-gray-600">Chargement de l'affaire...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">
          {dealId ? 'Modifier l\'affaire' : 'Créer une nouvelle affaire'}
        </h1>
        <DealForm
          tenantId={tenantId!}
          deal={deal || undefined}
          contactId={contactId || undefined}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </div>
    </DashboardLayout>
  );
};

