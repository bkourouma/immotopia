import type { MandantFundsNature } from '@prisma/client';

/**
 * Contrat des lectures de la comptabilité de l'agence (lot C, comptabilité
 * rapide et exploitable). Source unique des formes renvoyées par
 * `queries/*.ts` et `mandants.ts`, lues par le contrôleur et recopiées côté
 * web dans `apps/web/src/services/accounting-exports-service.ts`.
 *
 * Montants : nombres arrondis par `roundMoney`. Dates : ISO 8601 (`date`) ou
 * `AAAA-MM-JJ` (`from`, `to`, bornes de période). Pagination : `page` à
 * partir de 1, `limit` borné par le schéma Zod du contrôleur.
 */

// ---------------------------------------------------------------------------
// Commun
// ---------------------------------------------------------------------------

/** État de la synchronisation des comptes propriétaires de l'agence (instance courante). */
export interface SyncMeta {
  status: 'idle' | 'running' | 'error';
  /** Fin de la dernière synchronisation RÉUSSIE, ISO 8601 ; `null` si aucune depuis le démarrage. */
  lastSyncedAt: string | null;
}

/** Page demandée. `'all'` : toutes les lignes du filtre (exports CSV/XLSX). */
export type PageRequest = { page: number; limit: number } | 'all';

export interface Paged<T> {
  items: T[];
  /** Nombre total de lignes du filtre côté serveur. */
  total: number;
  page: number;
  /** Taille de page appliquée (`total` quand `'all'`). */
  limit: number;
}

export interface AccountRef {
  accountNumber: string;
  accountName: string;
}

// ---------------------------------------------------------------------------
// Méta — GET /meta
// ---------------------------------------------------------------------------

export interface AccountingMeta {
  journals: Array<{ code: string; label: string }>;
  /** Années civiles qui portent au moins une écriture, décroissantes. */
  years: number[];
  /** Première et dernière date d'écriture (`AAAA-MM-JJ`), `null` sans écriture. */
  minDate: string | null;
  maxDate: string | null;
}

// ---------------------------------------------------------------------------
// Journal — GET /journal
// ---------------------------------------------------------------------------

export interface JournalFilters {
  /** Code de journal, vérifié parmi les journaux de l'agence. */
  journal?: string;
  /** Numéro de compte ou préfixe : écritures qui ont au moins une ligne sur un compte commençant ainsi. */
  account?: string;
  /** Libellé de ligne, référence (pièce) ou description de l'écriture, insensible à la casse. */
  search?: string;
}

export interface JournalLineRow {
  accountNumber: string;
  accountName: string;
  label: string;
  thirdParty: string | null;
  nature: string | null;
  debit: number;
  credit: number;
}

export interface JournalEntryRow {
  id: string;
  date: string;
  journalCode: string;
  reference: string;
  description: string;
  documentType: string | null;
  reversed: boolean;
  /** Totaux des lignes de l'écriture. */
  debit: number;
  credit: number;
  /** Débits d'abord, puis par compte. */
  lines: JournalLineRow[];
}

export interface JournalPage extends Paged<JournalEntryRow> {
  from: string;
  to: string;
  /** Totaux de TOUT le filtre (toutes pages), par agrégat SQL. */
  totals: { debit: number; credit: number };
}

// ---------------------------------------------------------------------------
// Comptes — GET /accounts (sélecteur du grand livre)
// ---------------------------------------------------------------------------

export interface AccountOption extends AccountRef {
  id: string;
  accountClass: number;
}

export interface AccountSearch {
  /** Numéro (préfixe) ou intitulé (contient), insensible à la casse. */
  search?: string;
  /** Seulement les comptes mouvementés sur la période ou au solde d'ouverture non nul. */
  withMovements?: boolean;
  /** Obligatoire quand `withMovements`. */
  period?: { from: Date; to: Date };
  /** Nombre maximal de résultats (défaut 20, plafond 50). */
  limit: number;
}

// ---------------------------------------------------------------------------
// Grand livre — GET /general-ledger
// ---------------------------------------------------------------------------

/** Solde d'un compte sur la période, sens débit − crédit. */
export interface AccountBalanceRow extends AccountOption {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface BalanceSummary {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

/** Sans `account` : récapitulatif des comptes mouvementés, trié par numéro. */
export interface LedgerSummaryPage extends Paged<AccountBalanceRow> {
  mode: 'summary';
  from: string;
  to: string;
  /** Totaux de tout le filtre. */
  totals: BalanceSummary;
}

export interface LedgerFilters {
  /** Libellé de ligne ou référence (pièce), insensible à la casse. */
  search?: string;
  /** Code de journal, vérifié parmi les journaux de l'agence. */
  journal?: string;
}

export interface LedgerLineRow {
  /** Identifiant de la ligne d'écriture. */
  id: string;
  entryId: string;
  date: string;
  journalCode: string;
  reference: string;
  label: string;
  thirdParty: string | null;
  nature: string | null;
  debit: number;
  credit: number;
  /**
   * Solde progressif du compte après cette ligne, calculé en SQL sur TOUTES
   * les lignes du compte de la période (ouverture comprise), filtres de
   * recherche et de journal appliqués APRÈS : le solde affiché reste le vrai
   * solde du compte, même quand des lignes sont masquées.
   */
  balance: number;
}

/** Avec `account` : grand livre d'un compte, lignes triées [date, création de l'écriture, écriture, ligne]. */
export interface AccountLedgerPage extends Paged<LedgerLineRow> {
  mode: 'account';
  from: string;
  to: string;
  account: AccountOption;
  /** Synthèse du compte sur la période, sans tenir compte de `search` / `journal`. */
  summary: BalanceSummary;
  /** Débit et crédit des seules lignes filtrées ; `null` sans filtre. */
  filteredTotals: { debit: number; credit: number } | null;
  /** Comptes mouvementés voisins (ordre des numéros), pour « compte précédent / suivant ». */
  previousAccount: AccountRef | null;
  nextAccount: AccountRef | null;
}

// ---------------------------------------------------------------------------
// Balance générale — GET /trial-balance
// ---------------------------------------------------------------------------

export interface TrialBalanceFilters {
  /** Classe de compte, 1 à 9 (premier chiffre du numéro, colonne `account_class`). */
  accountClass?: number;
  /** Masquer les comptes soldés (solde de clôture nul). */
  hideZero?: boolean;
  /** Numéro (préfixe) ou intitulé (contient). */
  search?: string;
}

export interface TrialBalanceLine extends AccountOption {
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface TrialBalanceTotals {
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface TrialBalanceData {
  from: string;
  to: string;
  /** Toutes les lignes du filtre (non paginé : une ligne par compte). */
  lines: TrialBalanceLine[];
  /** Totaux des lignes filtrées. */
  totals: TrialBalanceTotals;
  /** Totaux de TOUS les comptes, filtres ignorés : base du contrôle d'équilibre. */
  control: TrialBalanceTotals;
  /** Équilibre calculé sur `control`. */
  isBalanced: boolean;
}

// ---------------------------------------------------------------------------
// Mandants — GET /mandant-subledger, GET /mandant-trial-balance
// ---------------------------------------------------------------------------

/** Clé d'un propriétaire dans l'URL : l'id du compte de tiers, ou cette valeur pour les lignes sans tiers. */
export const UNASSIGNED_OWNER = 'non-reparti';

export interface MandantControl {
  auxiliaryBalance: number;
  generalBalance: number;
  difference: number;
  isBalanced: boolean;
}

/** Solde d'un propriétaire sur la période, sens crédit − débit. */
export interface MandantOwnerRow {
  /** `thirdPartyAccountId` ou `UNASSIGNED_OWNER`. */
  ownerKey: string;
  thirdPartyAccountId: string | null;
  ownerLabel: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

/** Sans `owner` : propriétaires triés par libellé, « Non réparti » en dernier. */
export interface MandantOwnersPage extends Paged<MandantOwnerRow> {
  mode: 'owners';
  from: string;
  to: string;
  accountNumber: string;
  accountName: string;
  /** Totaux de tous les propriétaires du filtre. */
  totals: BalanceSummary;
  /** Contrôle sur tous les propriétaires, filtres ignorés. */
  control: MandantControl;
}

export interface MandantNatureSummary extends BalanceSummary {
  nature: MandantFundsNature;
  natureLabel: string;
}

export interface MandantLineRow {
  id: string;
  date: string;
  journalCode: string;
  reference: string;
  label: string;
  nature: MandantFundsNature;
  natureLabel: string;
  debit: number;
  credit: number;
  /** Solde progressif de la NATURE de la ligne pour ce propriétaire (sens crédit − débit). */
  balance: number;
}

/** Avec `owner` : lignes d'un propriétaire, paginées, triées chronologiquement. */
export interface MandantOwnerLedgerPage extends Paged<MandantLineRow> {
  mode: 'owner';
  from: string;
  to: string;
  owner: { ownerKey: string; thirdPartyAccountId: string | null; ownerLabel: string };
  /** Une synthèse par nature présente (ordre : compte courant, dépôt, à affecter). */
  natures: MandantNatureSummary[];
}

export interface MandantTrialBalanceRow {
  ownerKey: string;
  thirdPartyAccountId: string | null;
  ownerLabel: string;
  current: number;
  deposit: number;
  unallocated: number;
  total: number;
}

export interface MandantTrialBalancePage extends Paged<MandantTrialBalanceRow> {
  /** Date d'arrêté `AAAA-MM-JJ`. */
  date: string;
  accountNumber: string;
  accountName: string;
  /** Totaux de tout le filtre. */
  totals: { current: number; deposit: number; unallocated: number; total: number };
  /** Contrôle sur tous les propriétaires, filtres ignorés. */
  control: MandantControl;
}
