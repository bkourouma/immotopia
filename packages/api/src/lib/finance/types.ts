/**
 * Contrat gelé du domaine financier — lot 1, volet clients.
 *
 * Ce fichier est écrit **avant** les implémentations, et il ne bouge plus.
 * C'est ce qui permet à plusieurs agents de travailler en parallèle sans
 * s'attendre : chacun code contre ces signatures, et les talons ci-dessous
 * lèvent une erreur explicite tant que l'implémentation n'est pas là.
 *
 * Un agent qui a besoin d'une fonction non encore écrite la trouve donc avec
 * la bonne signature. Un agent qui ignore ce contrat ne compile pas.
 *
 * Trois règles tiennent ce fichier :
 *
 *   1. **Aucun « débit » ni « crédit » ne sort d'ici.** Les colonnes de la
 *      base portent ces noms, mais la frontière de l'API parle la langue de
 *      la gestionnaire : on *facture* (`amountBilled`) et on *règle*
 *      (`amountSettled`). C'est le principe P-1 du PRD, et il est vérifié
 *      par un test.
 *   2. **Les montants circulent en `number`**, arrondis par le grand livre,
 *      jamais en `Decimal` Prisma au-delà de la couche de données. Les
 *      colonnes restent en `Decimal(14,2)`.
 *   3. **Toute fonction qui écrit prend un client de transaction.** Le
 *      mouvement de compte de tiers naît dans la même transaction que la
 *      pièce qui le provoque, jamais à côté. Une fonction qui reçoit
 *      `prisma` au lieu de `tx` est un défaut.
 *
 * Références : `specs/016-finance-operationnelle/` (spécification, modèle de
 * données, contrat OpenAPI) et `docs/finance/PLAN-mise-en-oeuvre.md` §5.
 */

import type { Prisma, ThirdPartyKind, ThirdPartyMovementType } from '@prisma/client';
import type { PrismaTransactionClient } from '../../utils/database';

export type { ThirdPartyKind, ThirdPartyMovementType };

/** Levée par tout talon non encore implémenté. */
export class NotImplementedYetError extends Error {
  constructor(what: string) {
    super(`Non implémenté : ${what}. Le contrat existe, l'implémentation reste à écrire.`);
    this.name = 'NotImplementedYetError';
  }
}

// ---------------------------------------------------------------------------
// Pièces sources
// ---------------------------------------------------------------------------

/**
 * Nature de la pièce qui provoque un mouvement.
 *
 * Stocké en texte plutôt qu'en enum Postgres : `sourceId` pointe vers des
 * tables de nature différente selon la valeur, et les lots suivants en
 * ajouteront sans migration d'enum. Même parti pris que
 * `OwnerAccountTransaction.sourceId`.
 */
export type FinanceSourceType =
  | 'RENTAL_INSTALLMENT'
  | 'RENTAL_PAYMENT'
  | 'RENTAL_PAYMENT_ALLOCATION'
  | 'RENTAL_PENALTY'
  | 'RENT_BILLING_RUN'
  | 'OPENING_BALANCE'
  // Sources du lot 2, ajoutees le 19 septembre 2026. On AJOUTE a ce contrat
  // gele, on ne le reecrit pas : les six valeurs ci-dessus sont inchangees.
  //
  // Elles manquaient, et `lib/finance/suppliers.ts` s'en tirait par une
  // fonction de transtypage (`asFinanceSourceType`) qui affirmait au
  // compilateur ce que le type niait. Les nommer ici rend ce detour inutile et
  // redonne au type son role : refuser une source inventee.
  | 'SUPPLIER_INVOICE'
  | 'SUPPLIER_PAYMENT'
  | 'SUPPLIER_PAYMENT_ALLOCATION'
  | 'CASH_VOUCHER'
  // Mouvement d'inversion, pose par `voidDocumentTx` quand une piece est
  // annulee. Son `sourceId` est celui du mouvement inverse, ce qui le rend
  // unique sans effort.
  | 'VOID'
  // Sources du lot 4, baux de terrain. Ajoutees a l'integration : sans elles,
  // le service transtypait pour compiler, exactement comme `suppliers.ts` le
  // faisait au lot 2 avant que cette union soit etendue. Un transtypage
  // affirme au compilateur ce que le type nie ; le nommer ici rend le detour
  // inutile et redonne au type son role.
  | 'LAND_LEASE_PAYMENT'
  | 'LAND_LEASE_ACCRUAL'
  // Sources des sous-lots 3, 4 et 5 du lot 4 : salaires, tacherons, retenues
  // de garantie. Ajoutees a l'integration, pour la troisieme fois et pour la
  // meme raison — chaque sous-lot a d'abord transtype pour compiler, parce
  // que son contrat etait gele avant que cette union ne le soit.
  //
  // La retenue en porte DEUX, la pose et la liberation : ce sont deux
  // ecritures sur le meme identifiant de retenue, et une seule valeur les
  // rendrait indistinguables.
  // Sous-lot 2 : la ventilation entre associés. Elle n'écrit aucune écriture
  // comptable — seulement un mouvement de compte de tiers — et n'a donc pas
  // d'équivalent dans `PostDocumentEntryParams.documentType`.
  | 'PARTNERSHIP_DISTRIBUTION'
  | 'SALARY_NOTE'
  | 'SALARY_PAYMENT'
  | 'PROGRESS_STATEMENT'
  | 'CONTRACTOR_PAYMENT'
  | 'RETENTION_HELD'
  | 'RETENTION_RELEASED';

// ---------------------------------------------------------------------------
// Grand livre des comptes de tiers
// ---------------------------------------------------------------------------

export interface AppendMovementParams {
  accountId: string;
  tenantId: string;
  type: ThirdPartyMovementType;
  /** Ce que le tiers nous doit en plus. Exclusif avec `settled`. */
  billed?: number;
  /** Ce que le tiers a réglé. Exclusif avec `billed`. */
  settled?: number;
  /** Libellé affiché sur le relevé, en français. Jamais « débit » ni « crédit ». */
  label: string;
  sourceType: FinanceSourceType;
  sourceId: string;
  leaseId?: string | null;
  /** Date métier du mouvement, distincte de la date d'écriture technique. */
  movementDate?: Date;
}

export interface ThirdPartyMovementRecord {
  id: string;
  accountId: string;
  movementDate: Date;
  type: ThirdPartyMovementType;
  amountBilled: number | null;
  amountSettled: number | null;
  balanceAfter: number;
  label: string;
  sourceType: string;
  sourceId: string;
  leaseId: string | null;
  createdAt: Date;
}

/**
 * Ajoute un mouvement et met à jour le solde du compte, dans la transaction
 * fournie.
 *
 * Idempotent par `(sourceType, sourceId, type)` : rejouer le même mouvement
 * ne le duplique pas et renvoie l'existant. C'est ce qui rend le
 * rétro-remplissage et les reprises après incident sans danger.
 *
 * Renvoie `null` si le compte est introuvable, comme le fait déjà le grand
 * livre de la copropriété.
 */
export type AppendThirdPartyMovementTx = (
  tx: PrismaTransactionClient,
  params: AppendMovementParams
) => Promise<ThirdPartyMovementRecord | null>;

/**
 * Récupère le compte de tiers d'un locataire, ou le crée s'il n'existe pas.
 *
 * Un compte par `TenantClient`, jamais par bail : le relevé suit la personne.
 */
export type GetOrCreateTenantAccountTx = (
  tx: PrismaTransactionClient,
  tenantId: string,
  tenantClientId: string
) => Promise<{ id: string; label: string; balance: number } | null>;

/**
 * Reconstruit intégralement un compte depuis ses pièces d'origine.
 *
 * Sert au rétro-remplissage initial, à la reprise, et à la réconciliation si
 * une divergence apparaît entre le solde stocké et les pièces. Un test
 * compare la reconstruction au calcul incrémental sur un long historique :
 * les deux doivent coïncider au franc près.
 */
export type RebuildThirdPartyAccount = (
  tenantId: string,
  accountId: string
) => Promise<{ movementsWritten: number; balance: number }>;

// ---------------------------------------------------------------------------
// Campagne de facturation
// ---------------------------------------------------------------------------

/**
 * Pourquoi un bail actif n'a pas été facturé sur la période.
 *
 * Les trois premiers motifs viennent de `buildInstallmentForPeriod` ; les
 * trois suivants sont propres à la campagne. Tous sont affichés dans le
 * compte rendu : une exclusion sans motif est un défaut.
 */
export type BillingExclusionReason =
  | 'PERIOD_BEFORE_LEASE_START'
  | 'PERIOD_AFTER_LEASE_END'
  | 'PERIOD_OFF_BILLING_CYCLE'
  | 'LEASE_NOT_ACTIVE'
  | 'INSTALLMENT_ALREADY_EXISTS'
  | 'LEASE_WITHOUT_AMOUNT';

/**
 * Chaque ligne du compte rendu porte un libelle lisible en plus de son
 * identifiant.
 *
 * Sans lui, l'ecran afficherait « Bail 3f2a9b8c-… : 450 000 FCFA », ce qui ne
 * dit rien a la gestionnaire. Les libelles sont resolus une fois, a la
 * campagne, plutot que par une requete par ligne au moment de l'affichage :
 * le compte rendu est stocke tel quel dans `RentBillingRun.summary`, et doit
 * rester lisible des mois plus tard, meme si le bail a ete renomme ou clos.
 *
 * C'est aussi pour cela qu'ils sont recopies et non joints : un compte rendu
 * est une trace, pas une vue.
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

export interface BillingRunRecord {
  id: string;
  tenantId: string;
  periodYear: number;
  periodMonth: number;
  label: string;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  startedAt: Date;
  finishedAt: Date | null;
  createdByUserId: string;
  summary: BillingRunSummary | null;
}

/**
 * Lance la facturation d'une période pour tous les baux actifs d'un tenant.
 *
 * **Idempotente** : relancer la même période ne duplique aucune échéance et
 * met à jour la même campagne. L'idempotence ne repose pas sur une
 * vérification préalable, qui laisserait une fenêtre de concurrence, mais sur
 * la contrainte unique `(lease_id, period_year, period_month)` déjà posée sur
 * `rental_installments` : une collision est interceptée et devient le motif
 * d'exclusion `INSTALLMENT_ALREADY_EXISTS`.
 *
 * Applique aussi les avances : un règlement encaissé dont le reliquat n'a
 * jamais été affecté s'impute sur l'échéance générée, du plus ancien au plus
 * récent.
 */
export type RunRentBilling = (
  tenantId: string,
  params: { periodYear: number; periodMonth: number; label?: string },
  actorUserId: string
) => Promise<BillingRunRecord>;

// ---------------------------------------------------------------------------
// Restitution : balance, balance âgée, relevé
// ---------------------------------------------------------------------------

export interface PeriodRange {
  from?: Date;
  to?: Date;
}

export interface ClientsBalanceLine {
  accountId: string;
  tenantClientId: string;
  label: string;
  propertyLabels: string[];
  totalBilled: number;
  totalSettled: number;
  balance: number;
  currency: string;
}

export interface ClientsBalanceResult {
  lines: ClientsBalanceLine[];
  /** Total de contrôle : somme des soldes des lignes. */
  totalBalance: number;
  currency: string;
}

/**
 * Balance clients : une ligne par locataire.
 *
 * **Agrégation SQL obligatoire**, jamais en mémoire. Le banc de charge du lot
 * 0 mesure 93 ms en SQL contre 1 355 ms en mémoire à 500 tiers
 * (`docs/finance/REFERENCE-LOT-0.md`). Le regroupement suffit ici sans
 * jointure, parce que `ThirdPartyMovement` dénormalise `tenantId` et
 * `leaseId` exprès.
 */
export type GetClientsBalance = (
  tenantId: string,
  filters?: { range?: PeriodRange; propertyId?: string }
) => Promise<ClientsBalanceResult>;

export interface ClientsAgingBalanceLine extends ClientsBalanceLine {
  /** Échéances non encore exigibles. */
  notYetDue: number;
  days0To30: number;
  days30To60: number;
  days60To90: number;
  daysOver90: number;
}

export type GetClientsAgingBalance = (
  tenantId: string,
  filters?: { range?: PeriodRange; propertyId?: string; asOf?: Date }
) => Promise<{ lines: ClientsAgingBalanceLine[]; totalBalance: number; currency: string }>;

export interface AccountStatementResult {
  accountId: string;
  label: string;
  /**
   * La nature du tiers : locataire, fournisseur, salarie, tacheron, bailleur,
   * associe.
   *
   * Ajoutee le 20 septembre 2026. Sans elle, l'ecran de releve ne pouvait pas
   * savoir de qui il parlait : il servait le vocabulaire des LOCATAIRES a
   * tout le monde, et le releve d'un fournisseur annoncait « Loyer » devant
   * chacune de ses factures, sous un fil d'Ariane « Clients ».
   */
  kind: string;
  /** Solde avant la première ligne de la période, calculé depuis le dernier
   *  mouvement **antérieur** à la borne, et non depuis le solde courant.
   *  C'est le défaut n°3 du §6.1 bis du plan, qu'on ne reproduit pas ici. */
  openingBalance: number;
  closingBalance: number;
  currency: string;
  movements: ThirdPartyMovementRecord[];
  total: number;
}

export type GetAccountStatement = (
  tenantId: string,
  accountId: string,
  filters?: { range?: PeriodRange; skip?: number; take?: number }
) => Promise<AccountStatementResult>;

// ---------------------------------------------------------------------------
// Talons
//
// Chacun sera remplacé par une vraie implémentation, dans son propre fichier
// et par son propre agent. Ils existent pour que le code appelant compile et
// se teste avant que l'implémentation n'arrive.
// ---------------------------------------------------------------------------

export const appendThirdPartyMovementTxStub: AppendThirdPartyMovementTx = async () => {
  throw new NotImplementedYetError('appendThirdPartyMovementTx (lib/finance/ledger.ts)');
};

export const getOrCreateTenantAccountTxStub: GetOrCreateTenantAccountTx = async () => {
  throw new NotImplementedYetError('getOrCreateTenantAccountTx (lib/finance/ledger.ts)');
};

export const rebuildThirdPartyAccountStub: RebuildThirdPartyAccount = async () => {
  throw new NotImplementedYetError('rebuildThirdPartyAccount (lib/finance/ledger.ts)');
};

export const runRentBillingStub: RunRentBilling = async () => {
  throw new NotImplementedYetError('runRentBilling (lib/finance/billing-run.ts)');
};

export const getClientsBalanceStub: GetClientsBalance = async () => {
  throw new NotImplementedYetError('getClientsBalance (lib/finance/reports.ts)');
};

export const getClientsAgingBalanceStub: GetClientsAgingBalance = async () => {
  throw new NotImplementedYetError('getClientsAgingBalance (lib/finance/reports.ts)');
};

export const getAccountStatementStub: GetAccountStatement = async () => {
  throw new NotImplementedYetError('getAccountStatement (lib/finance/reports.ts)');
};

// ---------------------------------------------------------------------------
// Utilitaires de conversion
// ---------------------------------------------------------------------------

/**
 * Convertit un `Decimal` Prisma en `number`, en préservant `null`.
 *
 * Les montants sont stockés en `Decimal(14,2)` et lus en `number` au-delà de
 * la couche de données. La conversion est sûre ici : un montant en francs
 * CFA sur quatorze chiffres reste très en deçà de la précision entière d'un
 * flottant double.
 */
export function toAmount(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value);
}

/** Même conversion, avec zéro pour valeur par défaut. */
export function toAmountOrZero(value: Prisma.Decimal | number | null | undefined): number {
  return toAmount(value) ?? 0;
}
