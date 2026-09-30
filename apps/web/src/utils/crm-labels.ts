import { t } from '../i18n/t';

/**
 * Libellés français (traduits par `t()`) de TOUS les codes techniques du CRM :
 * types d'activité, directions, types et étapes d'affaire, priorités, sources
 * de lead, statuts de bien d'une affaire, types d'événements du calendrier,
 * étapes de l'entonnoir, statuts de visite.
 *
 * Module unique : un écran (liste, filtre, badge, info-bulle, export…) ne doit
 * JAMAIS afficher un code brut (`OUT`, `QUALIFIED`, `FOLLOW_UP_CALL`…). Chaque
 * table est un `Record` typé sur l'énumération du contrat : ajouter une valeur
 * au type TypeScript sans libellé casse la compilation, et
 * `__tests__/crm/crm-labels.test.ts` compare aussi les tables à
 * `schema.prisma`.
 *
 * Les tables sont des fonctions (et non des constantes de module) pour que
 * `t()` s'évalue à l'affichage, dans la langue courante.
 */

type Table<K extends string> = Record<K, string>;

export type CrmActivityTypeCode =
  'CALL' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'VISIT' | 'MEETING' | 'NOTE' | 'TASK' | 'CORRECTION';

export const activityTypeLabels = (): Table<CrmActivityTypeCode> => ({
  CALL: t('Appel'),
  EMAIL: t('Email'),
  SMS: t('SMS'),
  WHATSAPP: t('WhatsApp'),
  VISIT: t('Visite'),
  MEETING: t('Réunion'),
  NOTE: t('Note'),
  TASK: t('Tâche'),
  CORRECTION: t('Correction')
});

export const activityDirectionLabels = (): Table<'IN' | 'OUT' | 'INTERNAL'> => ({
  IN: t('Entrant'),
  OUT: t('Sortant'),
  INTERNAL: t('Interne')
});

export const dealTypeLabels = (): Table<'ACHAT' | 'LOCATION' | 'VENTE' | 'GESTION' | 'MANDAT'> => ({
  ACHAT: t('Achat'),
  LOCATION: t('Location'),
  VENTE: t('Vente'),
  GESTION: t('Gestion de biens'),
  MANDAT: t('Mandat')
});

export type CrmDealStageCode = 'NEW' | 'QUALIFIED' | 'VISIT' | 'NEGOTIATION' | 'WON' | 'LOST';

export const dealStageLabels = (): Table<CrmDealStageCode> => ({
  NEW: t('Nouveau'),
  QUALIFIED: t('Qualifié'),
  VISIT: t('Visite'),
  NEGOTIATION: t('Négociation'),
  WON: t('Gagné'),
  LOST: t('Perdu')
});

/** Accord au féminin : « une affaire qualifiée ». */
export const dealStageLabelsFeminine = (): Table<CrmDealStageCode> => ({
  NEW: t('Nouvelle'),
  QUALIFIED: t('Qualifiée'),
  VISIT: t('Visite'),
  NEGOTIATION: t('Négociation'),
  WON: t('Gagnée'),
  LOST: t('Perdue')
});

export const priorityLabels = (): Table<'LOW' | 'NORMAL' | 'HIGH'> => ({
  LOW: t('Basse'),
  NORMAL: t('Normale'),
  HIGH: t('Haute')
});

export const leadSourceLabels = (): Table<
  'WEBSITE' | 'SOCIAL_MEDIA' | 'REFERRAL' | 'CAMPAIGN' | 'AGENCY' | 'WALK_IN' | 'PHONE_CALL' | 'OTHER'
> => ({
  WEBSITE: t('Site web'),
  SOCIAL_MEDIA: t('Réseaux sociaux'),
  REFERRAL: t('Recommandation'),
  CAMPAIGN: t('Campagne'),
  AGENCY: t('Agence'),
  WALK_IN: t('Visite spontanée'),
  PHONE_CALL: t('Appel téléphonique'),
  OTHER: t('Autre')
});

export const dealPropertyStatusLabels = (): Table<
  'SHORTLISTED' | 'PROPOSED' | 'VISITED' | 'REJECTED' | 'SELECTED'
> => ({
  SHORTLISTED: t('Présélectionné'),
  PROPOSED: t('Proposé'),
  VISITED: t('Visité'),
  REJECTED: t('Refusé'),
  SELECTED: t('Sélectionné')
});

export const calendarEventTypeLabels = (): Table<'FOLLOWUP' | 'PROPERTY_VISIT'> => ({
  FOLLOWUP: t('Relance'),
  PROPERTY_VISIT: t('Visite')
});

export const visitTypeLabels = (): Table<'VISIT' | 'APPOINTMENT'> => ({
  VISIT: t('Visite'),
  APPOINTMENT: t('Rendez-vous')
});

export const visitStatusLabels = (): Table<'SCHEDULED' | 'CONFIRMED' | 'DONE' | 'NO_SHOW' | 'CANCELED'> => ({
  SCHEDULED: t('Planifiée'),
  CONFIRMED: t('Confirmée'),
  DONE: t('Effectuée'),
  NO_SHOW: t('Absent'),
  CANCELED: t('Annulée')
});

/**
 * Étapes de l'entonnoir : l'API les renvoie sous forme de mots anglais
 * (`Leads`, `Qualified`…), pas de codes d'énumération.
 */
export const funnelStepLabels = (): Table<'Leads' | 'Qualified' | 'Visit' | 'Negotiation' | 'Won'> => ({
  Leads: t('Leads'),
  Qualified: t('Qualifié'),
  Visit: t('Visite'),
  Negotiation: t('Négociation'),
  Won: t('Gagné')
});

/**
 * Types de prochaine action : champ libre côté saisie, mais l'API, les
 * semences et les automatismes y posent des codes (`FOLLOW_UP_CALL`, `CALL`…).
 */
export const nextActionTypeLabels = (): Record<string, string> => ({
  FOLLOW_UP: t('Relance'),
  FOLLOW_UP_CALL: t('Appel de relance'),
  FOLLOW_UP_EMAIL: t('E-mail de relance'),
  CALL: t('Appel'),
  EMAIL: t('Email'),
  SMS: t('SMS'),
  WHATSAPP: t('WhatsApp'),
  VISIT: t('Visite'),
  MEETING: t('Réunion'),
  NOTE: t('Note'),
  TASK: t('Tâche'),
  SEND_QUOTE: t('Envoyer un devis'),
  SEND_DOCUMENTS: t('Envoyer des documents'),
  CALLBACK: t('Rappel')
});

function lookup(table: Record<string, string>, code: string | null | undefined): string {
  if (!code) return '';
  return Object.prototype.hasOwnProperty.call(table, code) ? table[code] : code;
}

export const activityTypeLabel = (code?: string | null): string => lookup(activityTypeLabels(), code);
export const activityDirectionLabel = (code?: string | null): string => lookup(activityDirectionLabels(), code);
export const dealTypeLabel = (code?: string | null): string => lookup(dealTypeLabels(), code);
export const dealStageLabel = (code?: string | null): string => lookup(dealStageLabels(), code);
export const priorityLabel = (code?: string | null): string => lookup(priorityLabels(), code);
export const leadSourceLabel = (code?: string | null): string => lookup(leadSourceLabels(), code);
export const dealPropertyStatusLabel = (code?: string | null): string => lookup(dealPropertyStatusLabels(), code);
export const calendarEventTypeLabel = (code?: string | null): string => lookup(calendarEventTypeLabels(), code);
export const visitStatusLabel = (code?: string | null): string => lookup(visitStatusLabels(), code);
export const funnelStepLabel = (step?: string | null): string => lookup(funnelStepLabels(), step);

/**
 * Libellé d'un type de prochaine action. Un texte libre (« Rappel ») passe tel
 * quel ; un code inconnu en MAJUSCULES_SOULIGNÉES est adouci (« Send offer »)
 * plutôt qu'affiché brut.
 */
export function nextActionTypeLabel(code?: string | null): string {
  if (!code) return '';
  const table = nextActionTypeLabels();
  if (Object.prototype.hasOwnProperty.call(table, code)) return table[code];
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(code)) {
    const mots = code.toLowerCase().split('_').join(' ');
    return mots.charAt(0).toUpperCase() + mots.slice(1);
  }
  return code;
}

/** « Location — Qualifiée » : résumé d'une affaire (type + étape). */
export function dealSummaryLabel(type?: string | null, stage?: string | null): string {
  const typeText = dealTypeLabel(type);
  const stageText = stage ? lookup(dealStageLabelsFeminine(), stage) : '';
  return [typeText, stageText].filter(Boolean).join(' — ');
}

/**
 * Réécrit un libellé d'affaire construit par l'API (`LOCATION - QUALIFIED`) ;
 * un libellé qui n'a pas cette forme est rendu tel quel.
 */
export function dealLabelFromApi(label?: string | null): string | null {
  if (!label) return label ?? null;
  const m = /^([A-Z_]+) - ([A-Z_]+)$/.exec(label);
  if (m) return dealSummaryLabel(m[1], m[2]);
  return /^[A-Z_]+$/.test(label) ? dealTypeLabel(label) : label;
}

/** Badge d'un événement de calendrier renvoyé par l'API (mélange de codes et de mots). */
export function calendarBadgeLabel(badge: string): string {
  if (badge === 'Deal') return t('Affaire');
  if (badge === 'Relance') return t('Relance');
  if (badge === 'Visite') return t('Visite');
  if (badge === 'Rendez-vous') return t('Rendez-vous');
  const visite = visitStatusLabels() as Record<string, string>;
  if (Object.prototype.hasOwnProperty.call(visite, badge)) return visite[badge];
  return nextActionTypeLabel(badge);
}
