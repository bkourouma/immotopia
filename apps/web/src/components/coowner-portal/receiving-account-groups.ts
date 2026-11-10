import { t } from '../../i18n/t';
import type { CoOwnerChargeCall } from '../../services/coowner-portal-service';
import type { CoOwnerReceivingAccountPublic } from '../../services/receiving-account-service';
import { formatChargePeriod } from '../../utils/charge-period';

/**
 * Regroupement des comptes de réception par copropriété (portail
 * copropriétaire, spec 048 lot Q). Un paiement instantané est irrévocable :
 * chaque groupe ne montre que les comptes, le motif et la déclaration de SA
 * copropriété, jamais ceux d'une autre.
 */

export interface ReceivingAccountGroup {
  syndicateId: string;
  /** Nom tiré des données déjà chargées ; `null` s'il n'est pas connu. */
  name: string | null;
  accounts: CoOwnerReceivingAccountPublic[];
}

/** Groupes dans l'ordre d'arrivée des comptes (l'API les trie par ordre d'affichage). */
export function groupReceivingAccounts(
  accounts: CoOwnerReceivingAccountPublic[],
  syndicateNames: Readonly<Record<string, string>>
): ReceivingAccountGroup[] {
  const groups = new Map<string, ReceivingAccountGroup>();
  for (const account of accounts) {
    let group = groups.get(account.syndicateId);
    if (!group) {
      const name = syndicateNames[account.syndicateId]?.trim();
      group = { syndicateId: account.syndicateId, name: name || null, accounts: [] };
      groups.set(account.syndicateId, group);
    }
    group.accounts.push(account);
  }
  return [...groups.values()];
}

function dueTime(call: CoOwnerChargeCall): number {
  const time = Date.parse(call.dueDate);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/** Appel non soldé le plus ancien de la copropriété, trié par échéance (sans supposer l'ordre reçu). */
export function oldestUnpaidCall(calls: CoOwnerChargeCall[], syndicateId: string): CoOwnerChargeCall | null {
  const unpaid = calls.filter(call => call.syndicateId === syndicateId && call.outstanding > 0);
  unpaid.sort((a, b) => dueTime(a) - dueTime(b));
  return unpaid[0] ?? null;
}

/** Motif à recopier pour un appel de charges. */
export function chargeCallReason(call: CoOwnerChargeCall): string {
  return call.lot
    ? t('Appel de charges {{period}} — Lot {{lotNumber}}', {
        period: formatChargePeriod(call),
        lotNumber: call.lot.lotNumber
      })
    : t('Appel de charges {{period}}', { period: formatChargePeriod(call) });
}

/** Nom des copropriétés connues par les appels de charges (le premier nom non vide l'emporte). */
export function syndicateNamesFromCalls(
  calls: CoOwnerChargeCall[],
  extra: ReadonlyArray<{ id: string; name: string }> = []
): Record<string, string> {
  const names: Record<string, string> = {};
  for (const call of calls) {
    const name = call.syndicate?.trim();
    if (call.syndicateId && name && !names[call.syndicateId]) names[call.syndicateId] = name;
  }
  for (const syndicate of extra) {
    const name = syndicate.name?.trim();
    if (syndicate.id && name && !names[syndicate.id]) names[syndicate.id] = name;
  }
  return names;
}
