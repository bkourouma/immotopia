import React from 'react';
import { Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { t } from '../../i18n/t';
import { PaymentAccountsCard } from '../payment/PaymentAccountsCard';
import { listMyReceivingAccounts, type CoOwnerChargeCall } from '../../services/coowner-portal-service';
import { chargeCallReason, groupReceivingAccounts, oldestUnpaidCall } from './receiving-account-groups';

export interface CoOwnerReceivingAccountsSectionProps {
  /** Appels déjà chargés par la page : motif suggéré de chaque copropriété. */
  calls?: CoOwnerChargeCall[];
  /** Nom des copropriétés connues de la page, par identifiant. */
  syndicateNames?: Readonly<Record<string, string>>;
  /** Copropriétés où la déclaration de paiement est ouverte. */
  declarableSyndicateIds?: readonly string[];
  /** Fait défiler vers la déclaration de CETTE copropriété. */
  onDeclare?: (syndicateId: string) => void;
}

const NO_CALLS: CoOwnerChargeCall[] = [];
const NO_NAMES: Readonly<Record<string, string>> = {};
const NO_IDS: readonly string[] = [];

/**
 * « Payer l'agence » sur le portail copropriétaire (spec 048, lot Q). Une
 * carte par copropriété : ses comptes, le motif de SON plus ancien appel non
 * soldé et SA déclaration. Avec plusieurs copropriétés, chaque carte porte le
 * nom de la sienne pour ne jamais payer la mauvaise (paiement irrévocable).
 * Sans compte actif, ou si la lecture échoue, rien n'apparaît.
 */
export function CoOwnerReceivingAccountsSection({
  calls = NO_CALLS,
  syndicateNames = NO_NAMES,
  declarableSyndicateIds = NO_IDS,
  onDeclare
}: CoOwnerReceivingAccountsSectionProps): React.ReactElement | null {
  const { data } = useQuery({
    queryKey: ['coowner-portal', 'receiving-accounts'],
    queryFn: () => listMyReceivingAccounts(),
    staleTime: 60_000,
    retry: false
  });
  if (!data || data.length === 0) return null;

  const groups = groupReceivingAccounts(data, syndicateNames);
  const several = groups.length > 1;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {groups.map(group => {
        const call = oldestUnpaidCall(calls, group.syndicateId);
        const canDeclare = Boolean(onDeclare) && declarableSyndicateIds.includes(group.syndicateId);
        return (
          <PaymentAccountsCard
            key={group.syndicateId}
            accounts={group.accounts}
            subjectName={several ? (group.name ?? t('Copropriété (nom non disponible)')) : undefined}
            suggestedReason={call ? chargeCallReason(call) : null}
            onDeclare={canDeclare && onDeclare ? () => onDeclare(group.syndicateId) : undefined}
          />
        );
      })}
    </Space>
  );
}

export default CoOwnerReceivingAccountsSection;
