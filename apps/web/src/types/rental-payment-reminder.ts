/**
 * Contrat 049 section 3 : relances de loyers impayes (manuelles, jamais planifiees).
 *
 * Recopie a l'identique (sans import) dans `apps/web/src/types/rental-payment-reminder.ts`.
 * Dates : chaine ISO 8601. Montants : nombres en unites (FCFA).
 */

/** Canaux pris en charge. SMS et PUSH existent dans `ReminderChannel` mais ne sont PAS geres. */
export type RentalReminderChannel = 'EMAIL' | 'WHATSAPP';
/** Valeurs de l'enum Prisma `ReminderStatus`. Une relance ecrite vaut SENT ou FAILED (DELIVERED : futur). */
export type RentalReminderStatus = 'SENT' | 'DELIVERED' | 'FAILED';
/** Entier 1..3 (1 = amiable, 2 = ferme, 3 = dernier avis). */
export type RentalReminderLevel = 1 | 2 | 3;
/** Clef de notification : avant echeance ou en retard. */
export type RentalReminderEventKey = 'INSTALLMENT_DUE_REMINDER' | 'INSTALLMENT_OVERDUE';

export type RentalReminderExclusionReason =
  | 'ALREADY_PAID'
  | 'PENDING_DECLARATION'
  | 'PENDING_ONLINE_ATTEMPT'
  | 'TOO_SOON'
  | 'MAX_LEVEL_REACHED'
  | 'NO_CURRENT_TENANT'
  | 'LEASE_NOT_ACTIVE'
  | 'NO_CONTACT_CHANNEL'
  | 'EVENT_DISABLED'
  | 'NOT_DUE_YET';

export interface RentalReminderPaginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RentalReminderPreviewItemDto {
  installmentId: string;
  leaseId: string;
  leaseReference: string | null;
  propertyLabel: string | null;
  /** Locataire ACTUEL du bail ; null si NO_CURRENT_TENANT. */
  tenantClientId: string | null;
  tenantName: string | null;
  periodYear: number;
  periodMonth: number;
  dueDate: string;
  /** Jours de retard (> 0) ou jours avant echeance (valeur negative). */
  daysLate: number;
  /** Reste du, FCFA. */
  amountDue: number;
  currency: string;
  eventKey: RentalReminderEventKey;
  /** Niveau qui serait envoye (dernier niveau envoye + 1, min 1, max 3) ; null si exclu pour MAX_LEVEL_REACHED. */
  nextLevel: RentalReminderLevel | null;
  lastLevelSent: number | null;
  lastSentAt: string | null;
  /** Canaux utilisables (contact + evenement active). Vide si exclu. */
  channels: RentalReminderChannel[];
  /** Un lien de paiement serait joint (config passerelle utilisable). */
  paymentLinkIncluded: boolean;
  /** Vrai si la ligne sera envoyee par le lot (aucune exclusion). */
  eligible: boolean;
  exclusions: RentalReminderExclusionReason[];
}

/** Echeances eligibles groupees par locataire/bail. */
export interface RentalReminderPreviewGroupDto {
  leaseId: string;
  leaseReference: string | null;
  propertyLabel: string | null;
  tenantClientId: string | null;
  tenantName: string | null;
  totalDue: number;
  items: RentalReminderPreviewItemDto[];
}

export interface RentalReminderPreviewDto {
  generatedAt: string;
  groups: RentalReminderPreviewGroupDto[];
  totals: { eligible: number; excluded: number; amountDue: number };
}

/** Requete de l'apercu (query string). */
export interface RentalReminderPreviewQuery {
  /** Jours avant echeance inclus (defaut 0 = seulement les retards ; max 30). */
  daysBefore?: number;
  /** Retard minimal en jours (defaut 1). */
  minDaysLate?: number;
  leaseId?: string;
  propertyId?: string;
  search?: string;
  /** Defaut false : les lignes exclues sont renvoyees avec leurs raisons. */
  eligibleOnly?: boolean;
}

export interface SendReminderBody {
  /** Defaut : tous les canaux utilisables du preview. */
  channels?: RentalReminderChannel[];
  /** Force un niveau 1..3 ; defaut : niveau suivant. Ne contourne PAS les exclusions. */
  level?: RentalReminderLevel;
}

export type RentalReminderOutcomeStatus = 'SENT' | 'SKIPPED' | 'FAILED';

export interface RentalReminderChannelResultDto {
  channel: RentalReminderChannel;
  status: 'SENT' | 'FAILED';
  failureCode: string | null;
  reminderId: string | null;
}

export interface SendReminderResultDto {
  installmentId: string;
  status: RentalReminderOutcomeStatus;
  level: RentalReminderLevel | null;
  /** Renseigne si SKIPPED. */
  reason: RentalReminderExclusionReason | null;
  /** Renseigne si FAILED : code technique (aucun canal n'a abouti). */
  failureCode: string | null;
  channels: RentalReminderChannelResultDto[];
  paymentLinkId: string | null;
}

export interface BatchReminderBody {
  /** 1 a 100, sans doublon. */
  installmentIds: string[];
  channels?: RentalReminderChannel[];
}

export interface BatchReminderResultDto {
  results: SendReminderResultDto[];
  totals: { sent: number; skipped: number; failed: number };
}

export interface RentalPaymentReminderDto {
  id: string;
  tenant_id: string;
  installment_id: string;
  lease_id: string;
  level: number;
  channel: RentalReminderChannel;
  status: RentalReminderStatus;
  sent_by: string | null;
  sent_by_name: string | null;
  sent_at: string;
  payment_link_id: string | null;
  failure_code: string | null;
  /** Contexte affichable. */
  leaseReference: string | null;
  tenantName: string | null;
  periodYear: number;
  periodMonth: number;
  amountDue: number;
}

export interface ListRemindersQuery {
  installmentId?: string;
  leaseId?: string;
  channel?: RentalReminderChannel;
  status?: RentalReminderStatus;
  level?: number;
  /** YYYY-MM-DD sur sent_at ; `to` inclus. */
  from?: string;
  to?: string;
  page?: number;
  /** Defaut 20, max 100. */
  pageSize?: number;
}
