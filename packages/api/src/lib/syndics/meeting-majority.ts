/**
 * Regles de majorite des assemblees generales de copropriete (FR-008, FR-009).
 *
 * Le resultat d'une resolution se calcule sur les TANTIEMES generaux des lots
 * (`SyndicateLot.generalShares`), jamais sur le seul nombre de lots : un lot de
 * 400 tantiemes pese quatre fois un lot de 100.
 *
 * `GMResolution.majorityRule` reste une chaine libre en base (aucune
 * migration) ; les valeurs ci-dessous en sont les codes stables. Tout autre
 * texte (saisies historiques « Article 24 », « majorite simple »…) est traite
 * comme l'article 24.
 *
 * Fonctions pures : aucun acces base, pour etre testees seules et reutilisees
 * a l'identique par le vote (resultat stocke) et par la lecture (detail).
 */

import { t } from '../../i18n';

export const MAJORITY_RULES = ['ARTICLE_24', 'ARTICLE_25', 'ARTICLE_26', 'UNANIMITE'] as const;
export type MajorityRule = (typeof MAJORITY_RULES)[number];

/** Regle d'une nouvelle resolution quand rien n'est precise. */
export const DEFAULT_MAJORITY_RULE: MajorityRule = 'ARTICLE_24';

/** Libelles francais (compte rendu Word, messages), sans langue : voir `majorityRuleLabel`. */
export const MAJORITY_RULE_LABELS: Record<MajorityRule, string> = {
  ARTICLE_24: 'Article 24 - majorité simple des tantièmes exprimés',
  ARTICLE_25: 'Article 25 - majorité absolue des tantièmes de tous les lots',
  ARTICLE_26: 'Article 26 - double majorité (copropriétaires et 2/3 des tantièmes)',
  UNANIMITE: 'Unanimité de tous les lots'
};

/** Libelle de la regle dans la langue de la requete. */
export function majorityRuleLabel(rule: MajorityRule): string {
  switch (rule) {
    case 'ARTICLE_25':
      return t('Article 25 - majorité absolue des tantièmes de tous les lots');
    case 'ARTICLE_26':
      return t('Article 26 - double majorité (copropriétaires et 2/3 des tantièmes)');
    case 'UNANIMITE':
      return t('Unanimité de tous les lots');
    case 'ARTICLE_24':
    default:
      return t('Article 24 - majorité simple des tantièmes exprimés');
  }
}

export type VoteChoiceValue = 'FOR' | 'AGAINST' | 'ABSTAIN';

export interface MajorityLot {
  id: string;
  generalShares: number;
  /** Les deux champs designent le coproprietaire ; ils sont toujours ecrits ensemble. */
  coownerId?: string | null;
  ownerContactId?: string | null;
}

export interface MajorityVote {
  lotId: string;
  vote: VoteChoiceValue;
}

export interface ResolutionTally {
  rule: MajorityRule;
  /** Nombre de lots par sens de vote. */
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  /** Tantiemes par sens de vote. */
  sharesFor: number;
  sharesAgainst: number;
  sharesAbstain: number;
  /** Tantiemes de tous les lots de la copropriete. */
  totalShares: number;
  totalLots: number;
  /** Total auquel la regle compare les voix « pour » (exprimes pour l'art. 24, tous les lots sinon). */
  referenceShares: number;
  /** Coproprietaires distincts ayant vote pour, et nombre total de coproprietaires (art. 26). */
  ownersFor: number;
  totalOwners: number;
  /** `null` tant qu'aucun vote n'est saisi. */
  result: 'APPROVED' | 'REJECTED' | null;
}

export interface MeetingAttendance {
  /** Lots ayant vote au moins une fois dans l'assemblee, et leurs tantiemes. */
  representedLots: number;
  representedShares: number;
  totalLots: number;
  totalShares: number;
  /** Tantiemes representes / tantiemes totaux, en %, deux decimales. */
  quorumPercent: number;
}

/** Ramene une saisie libre a un code de regle ; tout texte inconnu vaut l'article 24. */
export function normalizeMajorityRule(raw: string | null | undefined): MajorityRule {
  const value = (raw ?? '').trim().toUpperCase();
  return (MAJORITY_RULES as readonly string[]).includes(value) ? (value as MajorityRule) : DEFAULT_MAJORITY_RULE;
}

/** Cle du coproprietaire d'un lot ; un lot sans coproprietaire connu compte pour un coproprietaire a part. */
function ownerKeyOf(lot: MajorityLot): string {
  return lot.coownerId ?? lot.ownerContactId ?? `lot:${lot.id}`;
}

export function computeResolutionTally(
  majorityRule: string | null | undefined,
  lots: MajorityLot[],
  votes: MajorityVote[]
): ResolutionTally {
  const rule = normalizeMajorityRule(majorityRule);
  const lotsById = new Map(lots.map(lot => [lot.id, lot]));

  let votesFor = 0;
  let votesAgainst = 0;
  let votesAbstain = 0;
  let sharesFor = 0;
  let sharesAgainst = 0;
  let sharesAbstain = 0;
  const ownersForSet = new Set<string>();

  for (const vote of votes) {
    const lot = lotsById.get(vote.lotId);
    // Un vote dont le lot n'appartient plus a la copropriete ne compte pas.
    if (!lot) continue;
    const shares = lot.generalShares || 0;
    if (vote.vote === 'FOR') {
      votesFor += 1;
      sharesFor += shares;
      // Un coproprietaire a plusieurs lots compte « pour » des qu'un de ses lots vote pour.
      ownersForSet.add(ownerKeyOf(lot));
    } else if (vote.vote === 'AGAINST') {
      votesAgainst += 1;
      sharesAgainst += shares;
    } else if (vote.vote === 'ABSTAIN') {
      votesAbstain += 1;
      sharesAbstain += shares;
    }
  }

  const totalShares = lots.reduce((sum, lot) => sum + (lot.generalShares || 0), 0);
  const totalLots = lots.length;
  const totalOwners = new Set(lots.map(ownerKeyOf)).size;
  const ownersFor = ownersForSet.size;
  const hasVotes = votesFor + votesAgainst + votesAbstain > 0;

  let approved: boolean;
  let referenceShares: number;
  switch (rule) {
    case 'ARTICLE_25':
      // Majorite absolue : pour > 50 % des tantiemes de TOUS les lots, votants ou non.
      referenceShares = totalShares;
      approved = sharesFor * 2 > totalShares;
      break;
    case 'ARTICLE_26':
      // Double majorite : plus de la moitie des coproprietaires (en nombre, sur tous
      // ceux de la copropriete) ET au moins 2/3 des tantiemes totaux. Calcul entier.
      referenceShares = totalShares;
      approved = ownersFor * 2 > totalOwners && sharesFor * 3 >= totalShares * 2;
      break;
    case 'UNANIMITE':
      // Tous les lots de la copropriete votent pour.
      referenceShares = totalShares;
      approved = totalLots > 0 && votesFor === totalLots;
      break;
    case 'ARTICLE_24':
    default:
      // Majorite simple des tantiemes exprimes : pour > contre, abstentions exclues.
      referenceShares = sharesFor + sharesAgainst;
      approved = sharesFor > sharesAgainst;
      break;
  }

  return {
    rule,
    votesFor,
    votesAgainst,
    votesAbstain,
    sharesFor,
    sharesAgainst,
    sharesAbstain,
    totalShares,
    totalLots,
    referenceShares,
    ownersFor,
    totalOwners,
    result: hasVotes ? (approved ? 'APPROVED' : 'REJECTED') : null
  };
}

/**
 * Presence de l'assemblee : un lot est represente des qu'il a vote sur au
 * moins une resolution (en personne ou par son mandataire). Indicatif, aucune
 * regle de quorum n'est bloquante.
 */
export function computeMeetingAttendance(lots: MajorityLot[], votes: Array<{ lotId: string }>): MeetingAttendance {
  const lotsById = new Map(lots.map(lot => [lot.id, lot]));
  const representedIds = new Set(votes.map(vote => vote.lotId).filter(lotId => lotsById.has(lotId)));
  const representedShares = Array.from(representedIds).reduce(
    (sum, lotId) => sum + (lotsById.get(lotId)?.generalShares || 0),
    0
  );
  const totalShares = lots.reduce((sum, lot) => sum + (lot.generalShares || 0), 0);
  const quorumPercent = totalShares > 0 ? Math.round((representedShares / totalShares) * 10000) / 100 : 0;

  return {
    representedLots: representedIds.size,
    representedShares,
    totalLots: lots.length,
    totalShares,
    quorumPercent
  };
}
