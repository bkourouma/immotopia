import {
  MajorityRule,
  MeetingContact,
  MeetingConvocationResult,
  MeetingLot,
  MeetingProxy,
  MeetingStatus
} from '../../types/syndic-types';
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

/**
 * Noms du ou des votants d'un lot à la date de l'AG, joints par « et ». Le
 * votant d'un lot est son propriétaire à la date de l'AG (pas forcément
 * l'actuel) ; en indivision, tous les indivisaires sont nommés, le plus gros
 * détenteur d'abord — `voters` est déjà trié ainsi par l'API. `voters` peut
 * manquer (ancienne API) ou être vide (aucun votant connu à cette date) :
 * repli sur `lot.owner`, sinon « Sans propriétaire ».
 */
export function voterNames(lot: MeetingLot | undefined): string {
  const voters = lot?.voters;
  if (voters && voters.length > 0) {
    const names = voters.map(voter => contactName({ ...voter, id: voter.contactId } as MeetingContact)).filter(Boolean);
    if (names.length > 0) return names.join(t(' et '));
  }
  return contactName(lot?.owner) !== '-' ? contactName(lot?.owner) : t('Sans propriétaire');
}

/**
 * Pouvoir donne par un votant du lot à la date de l'AG, s'il y en a un. Un
 * lot vendu depuis l'AG garde le pouvoir donné par son ancien propriétaire :
 * on cherche parmi `voters` (calculés côté API à la date de l'AG), pas
 * `lot.owner` (le propriétaire actuel). Repli sur l'owner actuel quand
 * `voters` est absent ou vide (ancienne API, ou aucun votant connu).
 */
export function proxyForLot(lot: MeetingLot | undefined, proxies: MeetingProxy[]): MeetingProxy | undefined {
  if (!lot) return undefined;
  const voters = lot.voters;
  if (voters && voters.length > 0) {
    const voterIds = new Set(voters.map(voter => voter.contactId));
    return proxies.find(proxy => voterIds.has(proxy.grantorContactId));
  }
  const ownerId = lotOwnerId(lot);
  return ownerId ? proxies.find(proxy => proxy.grantorContactId === ownerId) : undefined;
}

/** Une AG cloturee ou annulee est figee : ni vote, ni resolution, ni pouvoir. */
export function isMeetingFrozen(status: MeetingStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

/**
 * Raison affichee (infobulle) quand une action d'ecriture de la fiche est
 * desactivee ou masquee parce que l'AG est figee. Utilisee par toutes les
 * actions generiques (ordre du jour, date/lieu...) ; les votes et pouvoirs
 * gardent leur propre libelle, plus specifique, deja etabli.
 */
export function meetingFrozenReason(status: MeetingStatus): string {
  return status === 'CANCELLED'
    ? t("Assemblée annulée : plus aucune modification n'est possible.")
    : t("Séance clôturée : plus aucune modification n'est possible.");
}

export const meetingStatusColors: Record<MeetingStatus, string> = {
  PLANNED: 'blue',
  IN_PROGRESS: 'orange',
  COMPLETED: 'green',
  CANCELLED: 'red'
};

/**
 * Message de synthèse de l'envoi d'une convocation (création ou renvoi) :
 * `type` pilote la couleur de l'alerte, `failed` autorise le bouton de renvoi.
 */
export function describeConvocation(result: MeetingConvocationResult | null | undefined): {
  type: 'success' | 'warning' | 'info';
  text: string;
  failed: boolean;
} {
  if (!result) return { type: 'info', text: t('Convocation non transmise par le serveur.'), failed: false };
  if (result.error) {
    return {
      type: 'warning',
      text: t("L'envoi de la convocation a échoué : réessayez avec « Renvoyer la convocation »."),
      failed: true
    };
  }
  if (result.skipped === 'NO_OWNER_CONTACT' || result.owners === 0) {
    return { type: 'info', text: t('Aucun copropriétaire à convoquer pour cette copropriété.'), failed: false };
  }
  if (!result.emailEnabled) {
    return {
      type: 'info',
      text: t(
        "La notification « Convocation Assemblée Générale » est désactivée : aucun e-mail n'a été envoyé (Communication > Notifications e-mail)."
      ),
      failed: false
    };
  }
  const text = t(
    'Convocation : {{sent}} e-mail(s) envoyé(s), {{failed}} échoué(s), {{noAddress}} sans adresse e-mail.',
    {
      sent: result.emailSent,
      failed: result.emailFailed,
      noAddress: result.emailSkippedNoAddress
    }
  );
  const failed = result.emailFailed > 0;
  return { type: failed ? 'warning' : 'success', text, failed };
}
