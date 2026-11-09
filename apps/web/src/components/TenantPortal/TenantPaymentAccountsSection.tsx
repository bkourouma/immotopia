import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PaymentAccountsCard } from '../payment/PaymentAccountsCard';
import { tenantPortalService } from '../../services/tenantPortalService';

export interface TenantPaymentAccountsSectionProps {
  suggestedReason?: string | null;
  onDeclare?: () => void;
}

/**
 * « Payer l'agence » sur le portail locataire (spec 048, lot Q). Ne bloque rien :
 * sans compte actif, ou si la lecture échoue, la carte n'apparaît pas.
 */
export function TenantPaymentAccountsSection({
  suggestedReason,
  onDeclare
}: TenantPaymentAccountsSectionProps): React.ReactElement | null {
  const { data } = useQuery({
    queryKey: ['tenant-portal', 'receiving-accounts'],
    queryFn: () => tenantPortalService.getReceivingAccounts(),
    staleTime: 60_000,
    retry: false
  });
  if (!data || data.length === 0) return null;
  return <PaymentAccountsCard accounts={data} suggestedReason={suggestedReason} onDeclare={onDeclare} />;
}

export default TenantPaymentAccountsSection;
