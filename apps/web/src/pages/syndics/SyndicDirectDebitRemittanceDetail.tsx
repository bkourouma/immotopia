import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert } from 'antd';
import {
  cancelSyndicRemittance,
  exportSyndicRemittance,
  getSyndicRemittance,
  refreshSyndicRemittance,
  rejectSyndicRemittanceLine,
  removeSyndicRemittanceLine,
  resendSyndicPrenotifications,
  settleAllSyndicRemittanceLines,
  settleSyndicRemittanceLine,
  submitSyndicRemittance,
  validateSyndicRemittance
} from '../../services/syndic-direct-debit-service';
import {
  RemittanceDetailView,
  type RemittanceDetailApi
} from '../../components/rental/direct-debit/RemittanceDetailView';
import { SYNDIC_DD_KEYS } from '../../components/syndics/direct-debit/keys';
import { useSyndicDirectDebitRights } from '../../components/syndics/direct-debit/useSyndicDirectDebitRights';
import { PageHeader } from '../../components/primitives';
import { detailKey } from '../../lib/query-keys';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

/**
 * Détail d'une remise de copropriété (spec 042, P4, §9.6) : le même écran que
 * celui des loyers (`RemittanceDetailView`), branché sur les routes
 * `/syndics/:syndicId/prelevements/remises/...`. Consultation avec
 * `SYNDIC_DIRECT_DEBIT_VIEW`, gestes avec `SYNDIC_DIRECT_DEBIT_MANAGE`.
 */
export const SyndicDirectDebitRemittanceDetail: React.FC = () => {
  const { tenantId, syndicId } = useSyndicRouteContext();
  const { remittanceId } = useParams<{ remittanceId: string }>();
  const { canManage } = useSyndicDirectDebitRights(tenantId);

  const api = useMemo<RemittanceDetailApi>(() => {
    const tenant = tenantId as string;
    const syndic = syndicId as string;
    const remittance = remittanceId as string;
    return {
      get: () => getSyndicRemittance(tenant, syndic, remittance),
      refresh: () => refreshSyndicRemittance(tenant, syndic, remittance),
      validate: () => validateSyndicRemittance(tenant, syndic, remittance),
      resend: () => resendSyndicPrenotifications(tenant, syndic, remittance),
      exportFile: fallbackName => exportSyndicRemittance(tenant, syndic, remittance, fallbackName),
      submit: () => submitSyndicRemittance(tenant, syndic, remittance),
      cancel: reason => cancelSyndicRemittance(tenant, syndic, remittance, reason),
      withdrawLine: (lineId, reason) => removeSyndicRemittanceLine(tenant, syndic, remittance, lineId, reason),
      settleLine: (lineId, input) => settleSyndicRemittanceLine(tenant, syndic, remittance, lineId, input),
      rejectLine: (lineId, input) => rejectSyndicRemittanceLine(tenant, syndic, remittance, lineId, input),
      settleAll: input => settleAllSyndicRemittanceLines(tenant, syndic, remittance, input)
    };
  }, [tenantId, syndicId, remittanceId]);

  if (!tenantId || !syndicId || !remittanceId) {
    return <Alert type="error" showIcon message={t('Paramètres copropriété manquants')} />;
  }

  return (
    <RemittanceDetailView
      scope="SYNDIC_LOT"
      api={api}
      tenantId={tenantId}
      remittanceId={remittanceId}
      queryKey={detailKey('syndic-direct-debit-remittances', tenantId, remittanceId)}
      invalidateKey={SYNDIC_DD_KEYS.remittancesPrefix(tenantId)}
      canManage={canManage}
      renderHeader={remittance => (
        <>
          <Link to={`/tenant/${tenantId}/syndics/${syndicId}/prelevements`}>{t('Retour aux prélèvements')}</Link>
          <div style={{ marginBlockStart: 8 }}>
            <PageHeader
              title={remittance ? remittance.reference : t('Remise de prélèvements')}
              subtitle={
                remittance?.syndicate ? `${remittance.syndicate.name} · ${remittance.creditor.label}` : undefined
              }
            />
          </div>
        </>
      )}
    />
  );
};

export default SyndicDirectDebitRemittanceDetail;
