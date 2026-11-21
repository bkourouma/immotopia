import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { App, Button, Card, Space, Alert } from 'antd';
import { LeaseForm } from '../../components/rental/LeaseForm';
import { LeaseFormWizard } from '../../components/rental/LeaseFormWizard';
import {
  createLease,
  updateLease,
  getLease,
  CreateLeaseRequest,
  UpdateLeaseRequest,
  RentalLease
} from '../../services/rental-service';
import { t } from '../../i18n/t';
import { PageHeader } from '../../components/primitives/PageHeader';
import { SkeletonDetail } from '../../components/primitives/Skeleton';

export const LeaseFormPage: React.FC = () => {
  const { tenantId, leaseId } = useParams<{ tenantId: string; leaseId: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const location = useLocation();
  const initialPropertyId = (location.state as { propertyId?: string })?.propertyId;
  const [lease, setLease] = useState<RentalLease | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (leaseId && tenantId) {
      loadLease();
    }
  }, [leaseId, tenantId]);

  const [error, setError] = useState<string | null>(null);

  const loadLease = async () => {
    if (!tenantId || !leaseId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getLease(tenantId, leaseId);
      if (response.success) {
        setLease(response.data);
      } else {
        setError(t('Erreur lors du chargement du bail'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement du bail'));
      console.error('Error loading lease:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data: CreateLeaseRequest | UpdateLeaseRequest) => {
    if (!tenantId) return;

    // Errors propagate to LeaseForm, which renders them.
    if (leaseId) {
      const response = await updateLease(tenantId, leaseId, data as UpdateLeaseRequest);
      // Dit combien d'échéances à venir ont suivi le nouveau loyer (BUG-2026-11-03-018).
      const recalculees = response?.installmentsRepriced ?? 0;
      if (recalculees > 0) {
        message.info(
          t(
            '{{n}} échéance(s) à venir recalculée(s) au nouveau montant. Les échéances payées, commencées ou échues n’ont pas changé.',
            {
              n: recalculees
            }
          )
        );
      } else {
        message.success(t('Bail enregistré'));
      }
    } else {
      await createLease(tenantId, data as CreateLeaseRequest);
      message.success(t('Bail créé'));
    }
    navigate(`/tenant/${tenantId}/rental/leases`);
  };

  const handleCancel = () => {
    navigate(`/tenant/${tenantId}/rental/leases`);
  };

  if (loading && leaseId) {
    return <SkeletonDetail aria-label={t('Chargement du bail')} />;
  }

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <PageHeader
          title={leaseId ? t('Modifier le bail') : t('Nouveau bail')}
          subtitle={leaseId ? t('Modifiez les informations du bail') : t('Créez un nouveau bail de location')}
          breadcrumbs={[
            { label: t('Baux'), to: `/tenant/${tenantId}/rental/leases` },
            { label: leaseId ? t('Modifier le bail') : t('Nouveau bail') }
          ]}
        />

        {error && (
          <Alert
            message={t('Erreur')}
            description={error}
            type="error"
            showIcon
            action={
              leaseId ? (
                <Button size="small" onClick={() => void loadLease()}>
                  {t('Réessayer')}
                </Button>
              ) : undefined
            }
            closable
            onClose={() => setError(null)}
          />
        )}

        {leaseId ? (
          <Card>
            <LeaseForm
              lease={lease || undefined}
              tenantId={tenantId!}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              loading={loading}
            />
          </Card>
        ) : (
          <Card>
            <LeaseFormWizard
              tenantId={tenantId!}
              initialPropertyId={initialPropertyId}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              loading={loading}
            />
          </Card>
        )}
      </Space>
    </>
  );
};
