import { MajorityRule, MeetingContact, MeetingLot, MeetingProxy, MeetingStatus } from '../../types/syndic-types';
import { t } from '../../i18n/t';

/**
 * Regles de majorite d'une resolution. Le champ reste une chaine cote API :
 * ces codes sont les valeurs stables, et tout autre texte (saisies anciennes)
 * est traite comme l'article 24 — meme regle que lib/syndics/meeting-majority.ts.
 */
export const MAJORITY_RULE_CODES: MajorityRule[] = ['ARTICLE_24', 'ARTICLE_25', 'ARTICLE_26', 'UNANIMITE'];

export const DEFAULT_MAJORITY_RULE: MajorityRule = 'ARTICLE_24';

export function normalizeMajorityRule(raw?: string | null): MajorityRule {
  const value = (raw ?? '').trim().toUpperCase();
  return (MAJORITY_RULE_CODES as string[]).includes(value) ? (value as MajorityRule) : DEFAULT_MAJORITY_RULE;
}

// Libelles construits a l'appel (et non au chargement du module) pour suivre la langue.
export function majorityRuleLabel(rule: MajorityRule): string {
  switch (rule) {
    case 'ARTICLE_25':
      return t('Article 25 — majorité absolue');
    case 'ARTICLE_26':
      return t('Article 26 — double majorité');
    case 'UNANIMITE':
      return t('Unanimité');
    case 'ARTICLE_24':
    default:
      return t('Article 24 — majorité simple');
  }
}

export function majorityRuleHint(rule: MajorityRule): string {
  switch (rule) {
    case 'ARTICLE_25':
      return t('Pour > 50 % des tantièmes de tous les lots');
    case 'ARTICLE_26':
      return t('Plus de la moitié des copropriétaires et au moins 2/3 des tantièmes');
    case 'UNANIMITE':
      return t('Tous les lots votent pour');
    case 'ARTICLE_24':
    default:
      return t('Pour > contre, en tantièmes exprimés (abstentions exclues)');
  }
}

export function majorityRuleOptions() {
  return MAJORITY_RULE_CODES.map(rule => ({ value: rule, label: majorityRuleLabel(rule) }));
}

export function contactName(contact?: MeetingContact | null): string {
  if (!contact) return '-';
  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  return fullName || contact.legalName || contact.email || contact.id;
}

/** Coproprietaire d'un lot : `coownerId` et `ownerContactId` sont toujours ecrits ensemble. */
export function lotOwnerId(lot: MeetingLot): string | null {
  return lot.owner?.id ?? lot.ownerContactId ?? null;
}

/** Pouvoir donne par le coproprietaire du lot, s'il y en a un. */
export function proxyForLot(lot: MeetingLot | undefined, proxies: MeetingProxy[]): MeetingProxy | undefined {
  if (!lot) return undefined;
  const ownerId = lotOwnerId(lot);
  return ownerId ? proxies.find(proxy => proxy.grantorContactId === ownerId) : undefined;
}

/** Une AG cloturee ou annulee est figee : ni vote, ni resolution, ni pouvoir. */
export function isMeetingFrozen(status: MeetingStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

export const meetingStatusColors: Record<MeetingStatus, string> = {
  PLANNED: 'blue',
  IN_PROGRESS: 'orange',
  COMPLETED: 'green',
  CANCELLED: 'red'
};
