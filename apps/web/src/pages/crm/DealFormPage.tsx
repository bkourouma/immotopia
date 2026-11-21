import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { App } from 'antd';
import { DealForm } from '../../components/crm/DealForm';
import { PageHeader, StateBlock, SkeletonDetail } from '../../components/primitives';
import {
  getDeal,
  createDeal,
  updateDeal,
  CrmDeal,
  CreateCrmDealRequest,
  UpdateCrmDealRequest
} from '../../services/crm-service';
import { t } from '../../i18n/t';

export const DealFormPage: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, dealId } = useParams<{ tenantId: string; dealId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const contactId = searchParams.get('contactId');
  const [deal, setDeal] = useState<CrmDeal | null>(null);
  // En modification, le formulaire ne s'affiche qu'une fois l'affaire lue : jamais un formulaire vide à la place.
  const [loading, setLoading] = useState(Boolean(dealId));
  const [loadError, setLoadError] = useState(false);

  const loadDeal = useCallback(async () => {
    if (!tenantId || !dealId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await getDeal(tenantId, dealId);
      if (response.success) {
        setDeal(response.data);
      } else {
        setLoadError(true);
      }
    } catch (error) {
      console.error('Error loading deal:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId, dealId]);

  useEffect(() => {
    if (dealId && tenantId) {
      void loadDeal();
    }
  }, [dealId, tenantId, loadDeal]);

  const handleSubmit = async (data: CreateCrmDealRequest | UpdateCrmDealRequest) => {
    if (!tenantId) return;
    if (dealId) {
      await updateDeal(tenantId, dealId, data as UpdateCrmDealRequest);
      message.success(t('Affaire enregistrée'));
      navigate(`/tenant/${tenantId}/crm/deals/${dealId}`);
    } else {
      await createDeal(tenantId, data as CreateCrmDealRequest);
      message.success(t('Affaire enregistrée'));
      // Si on vient d'un contact, rediriger vers le contact, sinon vers la liste des affaires
      if (contactId) {
        navigate(`/tenant/${tenantId}/crm/contacts/${contactId}`);
      } else {
        navigate(`/tenant/${tenantId}/crm/deals`);
      }
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

  const title = dealId ? t("Modifier l'affaire") : t('Créer une nouvelle affaire');

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        breadcrumbs={[{ label: t('Affaires'), to: `/tenant/${tenantId}/crm/deals` }, { label: title }]}
      />
      {loading ? (
        <SkeletonDetail aria-label={t("Chargement de l'affaire...")} />
      ) : loadError ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger cette affaire. Vérifiez votre connexion puis réessayez.')}
          onRetry={() => void loadDeal()}
        />
      ) : (
        <DealForm
          tenantId={tenantId!}
          deal={deal || undefined}
          contactId={contactId || undefined}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
};
