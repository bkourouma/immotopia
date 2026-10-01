import React, { useState } from 'react';
import { Alert, Button, Card, Empty, Space, Spin } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { deleteInsurancePolicy } from '../../services/insurance-service';
import type { InsurancePolicyDto } from '../../types/insurance-types';
import { apiErrorMessage } from '../patrimoine/patrimoine-labels';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import { ClaimDetailDrawer } from './ClaimDetailDrawer';
import { ClaimFormModal } from './ClaimFormModal';
import { ClaimList } from './ClaimList';
import { PolicyFormModal } from './PolicyFormModal';
import { PolicyList } from './PolicyList';
import { useInsuranceData } from './useInsuranceData';

interface Props {
  propertyId: string;
  tenantId: string;
  /**
   * Droit d'édition des biens (PROPERTIES_EDIT). Le navigateur ne connaît pas
   * les permissions du rôle : faute d'information, les actions restent
   * proposées et l'API (garde EDIT) tranche ; un parent qui sait passe `false`.
   */
  canEdit?: boolean;
}

/** Onglet « Assurances et sinistres » de la fiche d'un bien. */
export const PropertyInsuranceTab: React.FC<Props> = ({ propertyId, tenantId, canEdit = true }) => {
  const { policies, claims, loading, loaded, error, load } = useInsuranceData(tenantId, propertyId);
  const [policyModal, setPolicyModal] = useState<{ open: boolean; policy: InsurancePolicyDto | null }>({
    open: false,
    policy: null
  });
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [openClaimId, setOpenClaimId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const removePolicy = async (policy: InsurancePolicyDto) => {
    setDeletingId(policy.id);
    try {
      await deleteInsurancePolicy(tenantId, policy.id);
      feedback.success(t('Police supprimée.'));
      await load();
    } catch (e) {
      const conflict = (e as { response?: { status?: number } })?.response?.status === 409;
      feedback.error(
        apiErrorMessage(
          e,
          conflict
            ? t('Cette police a des sinistres rattachés : elle ne peut pas être supprimée.')
            : t('Suppression impossible.')
        )
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <Spin />;
  const retry = (
    <Button size="small" onClick={() => void load()}>
      {t('Réessayer')}
    </Button>
  );
  // Rien de chargé : l'alerte seule. Des données déjà là : l'alerte s'ajoute, le reste reste visible.
  if (error && !loaded) return <Alert type="error" showIcon message={error} action={retry} />;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {error && <Alert type="error" showIcon message={error} action={retry} />}
      <Card
        title={t('Polices')}
        extra={
          canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setPolicyModal({ open: true, policy: null })}>
              {t('Ajouter une police')}
            </Button>
          )
        }
      >
        {policies.length === 0 ? (
          <Empty description={t("Aucune police d'assurance pour ce bien.")} />
        ) : (
          <PolicyList
            policies={policies}
            canEdit={canEdit}
            deletingId={deletingId}
            onEdit={policy => setPolicyModal({ open: true, policy })}
            onDelete={removePolicy}
          />
        )}
      </Card>

      <Card
        title={t('Sinistres')}
        extra={
          canEdit && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={policies.length === 0}
              onClick={() => setClaimModalOpen(true)}
            >
              {t('Déclarer un sinistre')}
            </Button>
          )
        }
      >
        {claims.length === 0 ? (
          <Empty description={t('Aucun sinistre déclaré pour ce bien.')} />
        ) : (
          <ClaimList claims={claims} onOpen={setOpenClaimId} />
        )}
      </Card>

      <PolicyFormModal
        open={policyModal.open}
        tenantId={tenantId}
        propertyId={propertyId}
        policy={policyModal.policy}
        onClose={() => setPolicyModal({ open: false, policy: null })}
        onSaved={() => {
          setPolicyModal({ open: false, policy: null });
          void load();
        }}
      />
      <ClaimFormModal
        open={claimModalOpen}
        tenantId={tenantId}
        propertyId={propertyId}
        policies={policies}
        onClose={() => setClaimModalOpen(false)}
        onSaved={() => {
          setClaimModalOpen(false);
          void load();
        }}
      />
      <ClaimDetailDrawer
        tenantId={tenantId}
        claimId={openClaimId}
        canEdit={canEdit}
        onClose={() => setOpenClaimId(null)}
        onChanged={() => void load()}
      />
    </Space>
  );
};

export default PropertyInsuranceTab;
