/**
 * Contrat gelé de la frontière réseau — module financier, lot 1.
 *
 * Écrit avant les écrans, il ne bouge plus. Les trois agents qui construisent
 * les écrans codent contre ces types, et contre `services/finance-service.ts`
 * qui les produit. C'est ce qui leur permet d'avancer sans attendre l'API :
 * l'atelier (`src/dev/atelier/`) branche une fausse API sous l'adaptateur
 * axios, de sorte que services, React Query et écrans s'exécutent exactement
 * comme en production.
 *
 * **Aucun « débit » ni « crédit » ici.** Les colonnes de la base portent ces
 * noms, la frontière de l'API non : on *facture* (`amountBilled`) et on
 * *règle* (`amountSettled`). C'est le principe P-1 du PRD, vérifié par un
 * test qui échouera si l'un de ces mots apparaît à l'écran.
 *
 * Les montants arrivent en `number`, déjà arrondis par le serveur. La devise
 * stockée est `XOF` ; l'affichage dit « FCFA », et c'est `MoneyValue` qui
 * s'en charge — jamais un suffixe écrit en dur dans un écran.
 *
 * Source : `specs/016-finance-operationnelle/contracts/openapi.yaml`.
 */

/** Nature d'un mouvement, telle que l'API la renvoie. */
export type ThirdPartyMovementType =
  | 'INSTALLMENT'
  | 'PAYMENT'
  | 'ADVANCE_RECEIVED'
  | 'ADVANCE_APPLIED'
  | 'PENALTY'
  | 'WAIVER'
  | 'ADJUSTMENT'
  | 'OPENING_BALANCE'
  | 'VOID';

/** Une ligne de la balance clients. */
export interface ClientsBalanceLine {
  accountId: string;
  tenantClientId: string;
  /** Nom du locataire. */
  label: string;
  /** Biens rattachés aux baux du locataire, dans le périmètre filtré. */
  propertyLabels: string[];
  totalBilled: number;
  totalSettled: number;
  /** Solde courant. Positif : le locataire nous doit. */
  balance: number;
  currency: string;
}

export interface ClientsBalance {
  lines: ClientsBalanceLine[];
  /** Total de contrôle, affiché en pied de liste. */
  totalBalance: number;
  currency: string;
}

/** Une ligne de la balance âgée : la balance, ventilée par ancienneté. */
export interface ClientsAgingBalanceLine extends ClientsBalanceLine {
  /** Échéances non encore exigibles. */
  notYetDue: number;
  days0To30: number;
  days30To60: number;
  days60To90: number;
  daysOver90: number;
}

export interface ClientsAgingBalance {
  lines: ClientsAgingBalanceLine[];
  totalBalance: number;
  currency: string;
}

/** Une ligne de relevé de compte. */
export interface ThirdPartyMovementLine {
  id: string;
  movementDate: string;
  type: ThirdPartyMovementType;
  /** Libellé en français, prêt à afficher. */
  label: string;
  amountBilled: number | null;
  amountSettled: number | null;
  balanceAfter: number;
  currency: string;
  leaseId: string | null;
}

export interface AccountStatement {
  accountId: string;
  label: string;
  openingBalance: number;
  closingBalance: number;
  currency: string;
  movements: ThirdPartyMovementLine[];
  total: number;
}

/** Pourquoi un bail n'a pas été facturé par une campagne. */
export type BillingExclusionReason =
  | 'PERIOD_BEFORE_LEASE_START'
  | 'PERIOD_AFTER_LEASE_END'
  | 'PERIOD_OFF_BILLING_CYCLE'
  | 'LEASE_NOT_ACTIVE'
  | 'INSTALLMENT_ALREADY_EXISTS'
  | 'LEASE_WITHOUT_AMOUNT';

/**
 * Libellés des motifs d'exclusion.
 *
 * Ils vivent ici, avec le type, pour qu'un motif ajouté à l'API ne puisse pas
 * s'afficher brut à l'écran : TypeScript exige une entrée par valeur.
 */
export const BILLING_EXCLUSION_LABELS: Record<BillingExclusionReason, string> = {
  PERIOD_BEFORE_LEASE_START: 'La période précède le début du bail',
  PERIOD_AFTER_LEASE_END: 'La période suit la fin du bail',
  PERIOD_OFF_BILLING_CYCLE: 'Le bail ne se facture pas sur ce mois',
  LEASE_NOT_ACTIVE: "Le bail n'est pas actif",
  INSTALLMENT_ALREADY_EXISTS: 'Une échéance existe déjà pour cette période',
  LEASE_WITHOUT_AMOUNT: 'Le bail ne porte aucun montant'
};

/**
 * Chaque ligne du compte rendu porte un libelle lisible en plus de son
 * identifiant : « Fatoumata Diallo — Villa Kipe 12 », et non un UUID.
 *
 * Les libelles sont resolus par le serveur au moment de la campagne et
 * stockes avec elle. Un compte rendu est une trace, pas une vue : il doit
 * rester lisible des mois plus tard, meme si le bail a depuis ete clos.
 */
export interface BillingRunSummary {
  billed: Array<{ leaseId: string; leaseLabel: string; installmentId: string; amount: number }>;
  excluded: Array<{ leaseId: string; leaseLabel: string; reason: BillingExclusionReason }>;
  advancesApplied: Array<{
    tenantClientId: string;
    tenantLabel: string;
    installmentId: string;
    amount: number;
    sourcePaymentId: string;
  }>;
}

export interface BillingRun {
  id: string;
  periodYear: number;
  periodMonth: number;
  /** Par exemple « Loyer de septembre 2026 ». */
  label: string;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  startedAt: string;
  finishedAt: string | null;
  summary: BillingRunSummary | null;
}

/** Filtres de la balance, reflétés dans l'URL de l'écran. */
export interface BalanceFilters {
  from?: string;
  to?: string;
  propertyId?: string;
}

/** Filtres du relevé, reflétés dans l'URL de l'écran. */
export interface StatementFilters {
  from?: string;
  to?: string;
  skip?: number;
  take?: number;
}
