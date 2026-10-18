import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  cancelRemittance,
  cancelRemittanceLine,
  exportRemittance,
  getRemittance,
  refreshRemittance,
  rejectRemittanceLine,
  resendPrenotifications,
  settleAllRemittanceLines,
  settleRemittanceLine,
  submitRemittance,
  validateRemittance
} from '../../services/direct-debit-service';
import { PageHeader } from '../../components/primitives';
import { DirectDebitTabs } from '../../components/rental/direct-debit/DirectDebitTabs';
import {
  RemittanceDetailView,
  type RemittanceDetailApi
} from '../../components/rental/direct-debit/RemittanceDetailView';
import { invalidateRentalCollections } from '../../components/rental/direct-debit/ReturnConstatModals';
import { formatPeriod } from '../../components/rental/direct-debit/direct-debit-shared';
import { detailKey, entityKeyPrefix } from '../../lib/query-keys';
import { t } from '../../i18n/t';

/**
 * Détail d'une remise de prélèvements de loyers (spec 042, P2, §7.3 et §7.10).
 * L'écran vit dans `RemittanceDetailView`, partagé avec la copropriété (P4) ;
 * cette page n'apporte que l'en-tête, les onglets et les routes du locatif.
 */
export const DirectDebitRemittanceDetail: React.FC = () => {
  const { tenantId, remittanceId } = useParams<{ tenantId: string; remittanceId: string }>();

  const api = useMemo<RemittanceDetailApi>(() => {
    const tenant = tenantId as string;
    const remittance = remittanceId as string;
    return {
      get: () => getRemittance(tenant, remittance),
      refresh: () => refreshRemittance(tenant, remittance),
      validate: () => validateRemittance(tenant, remittance),
      resend: () => resendPrenotifications(tenant, remittance),
      exportFile: fallbackName => exportRemittance(tenant, remittance, fallbackName),
      submit: () => submitRemittance(tenant, remittance),
      cancel: reason => cancelRemittance(tenant, remittance, reason),
      withdrawLine: (lineId, reason) => cancelRemittanceLine(tenant, remittance, lineId, reason),
      settleLine: (lineId, input) => settleRemittanceLine(tenant, remittance, lineId, input),
      rejectLine: (lineId, input) => rejectRemittanceLine(tenant, remittance, lineId, input),
      settleAll: input => settleAllRemittanceLines(tenant, remittance, input)
    };
  }, [tenantId, remittanceId]);

  return (
    <RemittanceDetailView
      scope="RENTAL_LEASE"
      api={api}
      tenantId={tenantId as string}
      remittanceId={remittanceId as string}
      queryKey={detailKey('direct-debit-remittances', tenantId, remittanceId as string)}
      invalidateKey={entityKeyPrefix('direct-debit-remittances', tenantId)}
      onCollectionsChanged={queryClient => invalidateRentalCollections(queryClient, tenantId)}
      paymentHref={line => (line.paymentId ? `/tenant/${tenantId}/rental/payments/${line.paymentId}` : null)}
      renderHeader={remittance => (
        <>
          <PageHeader
            title={remittance ? remittance.reference : t('Remise de prélèvements')}
            subtitle={
              remittance
                ? `${remittance.creditor.label} · ${formatPeriod(remittance.periodYear, remittance.periodMonth)}`
                : undefined
            }
          />
          <DirectDebitTabs />
        </>
      )}
    />
  );
};
