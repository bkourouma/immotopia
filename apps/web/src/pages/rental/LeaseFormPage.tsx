import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, Space, Typography, Spin, Alert } from 'antd';
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

const { Title, Text } = Typography;

export const LeaseFormPage: React.FC = () => {
  const { tenantId, leaseId } = useParams<{ tenantId: string; leaseId: string }>();
  const navigate = useNavigate();
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
      await updateLease(tenantId, leaseId, data as UpdateLeaseRequest);
    } else {
      await createLease(tenantId, data as CreateLeaseRequest);
    }
    navigate(`/tenant/${tenantId}/rental/leases`);
  };

  const handleCancel = () => {
    navigate(`/tenant/${tenantId}/rental/leases`);
  };

  if (loading && leaseId) {
    return (
      <>
        <Card>
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text>{t('Chargement du bail...')}</Text>
            </div>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            {leaseId ? t('Modifier le bail') : t('Nouveau bail')}
          </Title>
          <Text type="secondary">
            {leaseId ? t('Modifiez les informations du bail') : t('Créez un nouveau bail de location')}
          </Text>
        </div>

        {error && (
          <Alert
            message={t('Erreur')}
            description={error}
            type="error"
            showIcon
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
