import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PaymentAccountsCard } from '../payment/PaymentAccountsCard';
import { listMyReceivingAccounts } from '../../services/coowner-portal-service';

export interface CoOwnerReceivingAccountsSectionProps {
  suggestedReason?: string | null;
  onDeclare?: () => void;
}

/**
 * « Payer l'agence » sur le portail copropriétaire (spec 048, lot Q). Sans
 * compte actif, ou si la lecture échoue, la carte n'apparaît pas.
 */
export function CoOwnerReceivingAccountsSection({
  suggestedReason,
  onDeclare
}: CoOwnerReceivingAccountsSectionProps): React.ReactElement | null {
  const { data } = useQuery({
    queryKey: ['coowner-portal', 'receiving-accounts'],
    queryFn: () => listMyReceivingAccounts(),
    staleTime: 60_000,
    retry: false
  });
  if (!data || data.length === 0) return null;
  return <PaymentAccountsCard accounts={data} suggestedReason={suggestedReason} onDeclare={onDeclare} />;
}

export default CoOwnerReceivingAccountsSection;
