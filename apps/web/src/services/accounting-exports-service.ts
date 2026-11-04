import apiClient from '../utils/api-client';

/**
 * Comptabilité de l'agence — journal, grand livre, balance générale, mandants.
 *
 * Comptabilité **opérationnelle** (gestion locative, fournisseurs, chantiers),
 * pas celle des copropriétés (`services/syndic-service.ts`).
 *
 * Lot C (comptabilité rapide) : chaque lecture est paginée côté serveur et
 * répond sans attendre la synchronisation des comptes propriétaires, qui
 * tourne en arrière-plan. L'enveloppe est `{ success, data, meta: { sync } }` :
 * chaque fonction renvoie `data` augmenté de `sync`, l'état de cette
 * synchronisation, pour le bandeau « Mise à jour des écritures en cours… ».
 *
 * Types recopiés de `packages/api/src/lib/accounting-exports/types.ts`.
 *
 * Toutes les lectures passent `noRetry: true` : un rejeu automatique d'une
 * lecture lente empilait les requêtes sur un serveur déjà occupé.
 */

const BASE = (tenantId: string) => `/tenants/${tenantId}/finance/accounting`;

export type AccountingExportFormat = 'json' | 'csv' | 'xlsx';
export type AccountingReport =
  'journal' | 'general-ledger' | 'trial-balance' | 'mandant-subledger' | 'mandant-trial-balance';

// ---------------------------------------------------------------------------
// Commun
// ---------------------------------------------------------------------------

export interface SyncMeta {
  status: 'idle' | 'running' | 'error';
  /** Fin de la dernière synchronisation réussie (ISO 8601), `null` sinon. */
  lastSyncedAt: string | null;
}

export type WithSync<T> = T & { sync: SyncMeta };

/** Bornes de période. `from`/`to` au format `YYYY-MM-DD`. */
export interface AccountingPeriodParams {
  from?: string;
  to?: string;
}

export interface PageParams {
  page?: number;
  limit?: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AccountRef {
  accountNumber: string;
  accountName: string;
}

export interface AccountOption extends AccountRef {
  id: string;
  accountClass: number;
}

export interface BalanceSummary {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

// ---------------------------------------------------------------------------
// Méta
// ---------------------------------------------------------------------------

export interface AccountingJournalRef {
  code: string;
  label: string;
}

export interface AccountingMeta {
  journals: AccountingJournalRef[];
  /** Années civiles qui portent au moins une écriture, décroissantes. */
  years: number[];
  minDate: string | null;
  maxDate: string | null;
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

export interface JournalEntryLine {
  accountNumber: string;
  accountName: string;
  label: string;
  /** Libellé du compte de tiers de la ligne (mandant), absent sinon. */
  thirdParty: string | null;
  /** Nature des fonds de mandant — « Compte courant », « Dépôt de garantie », « À affecter ». */
  nature: string | null;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  journalCode: string;
  reference: string;
  description: string;
  documentType: string | null;
  /** Contre-passée par une écriture ultérieure. */
  reversed: boolean;
  debit: number;
  credit: number;
  lines: JournalEntryLine[];
}

export interface JournalPage extends Paged<JournalEntry> {
  from: string;
  to: string;
  /** Totaux de tout le filtre, toutes pages confondues. */
  totals: { debit: number; credit: number };
}

export interface JournalParams extends AccountingPeriodParams, PageParams {
  journal?: string;
  /** Numéro de compte ou préfixe. */
  account?: string;
  /** Libellé, pièce ou description. */
  search?: string;
}

// ---------------------------------------------------------------------------
// Grand livre
// ---------------------------------------------------------------------------

export interface AccountBalanceRow extends AccountOption, BalanceSummary {}

export interface LedgerSummaryPage extends Paged<AccountBalanceRow> {
  mode: 'summary';
  from: string;
  to: string;
  totals: BalanceSummary;
}

export interface GeneralLedgerLine {
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
  /** Solde progressif du compte après la ligne, calculé côté serveur. */
  balance: number;
}

export interface AccountLedgerPage extends Paged<GeneralLedgerLine> {
  mode: 'account';
  from: string;
  to: string;
  account: AccountOption;
  /** Synthèse du compte sur la période, filtres de recherche et de journal ignorés. */
  summary: BalanceSummary;
  /** Débit et crédit des seules lignes filtrées ; `null` sans filtre. */
  filteredTotals: { debit: number; credit: number } | null;
  previousAccount: AccountRef | null;
  nextAccount: AccountRef | null;
}

export interface LedgerSummaryParams extends AccountingPeriodParams, PageParams {
  search?: string;
}

export interface AccountLedgerParams extends AccountingPeriodParams, PageParams {
  /** Numéro de compte exact. */
  account: string;
  search?: string;
  journal?: string;
}

export interface AccountSearchParams extends AccountingPeriodParams {
  search?: string;
  withMovements?: boolean;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Balance générale
// ---------------------------------------------------------------------------

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
  /** Toutes les lignes du filtre (une par compte, non paginé). */
  lines: TrialBalanceLine[];
  /** Totaux des lignes filtrées. */
  totals: TrialBalanceTotals;
  /** Totaux de tous les comptes, base du contrôle d'équilibre. */
  control: TrialBalanceTotals;
  isBalanced: boolean;
}

export interface TrialBalanceParams extends AccountingPeriodParams {
  /** Classe de compte, 1 à 9. */
  accountClass?: number;
  /** Masquer les comptes soldés. */
  hideZero?: boolean;
  search?: string;
}

// ---------------------------------------------------------------------------
// Mandants
// ---------------------------------------------------------------------------

/** Clé d'URL des lignes sans compte de tiers. */
export const UNASSIGNED_OWNER = 'non-reparti';

export type MandantFundsNature = 'CURRENT' | 'DEPOSIT' | 'UNALLOCATED';

/** Le total auxiliaire doit égaler le solde général du compte de fonds. */
export interface MandantControl {
  auxiliaryBalance: number;
  generalBalance: number;
  difference: number;
  isBalanced: boolean;
}

/** Solde d'un propriétaire sur la période, sens crédit − débit. */
export interface MandantOwnerRow extends BalanceSummary {
  ownerKey: string;
  thirdPartyAccountId: string | null;
  ownerLabel: string;
}

export interface MandantOwnersPage extends Paged<MandantOwnerRow> {
  mode: 'owners';
  from: string;
  to: string;
  accountNumber: string;
  accountName: string;
  totals: BalanceSummary;
  control: MandantControl;
}

export interface MandantNatureSummary extends BalanceSummary {
  nature: MandantFundsNature;
  natureLabel: string;
}

export interface MandantLine {
  id: string;
  date: string;
  journalCode: string;
  reference: string;
  label: string;
  nature: MandantFundsNature;
  natureLabel: string;
  debit: number;
  credit: number;
  /** Solde progressif de la nature de la ligne pour ce propriétaire. */
  balance: number;
}

export interface MandantOwnerLedgerPage extends Paged<MandantLine> {
  mode: 'owner';
  from: string;
  to: string;
  owner: { ownerKey: string; thirdPartyAccountId: string | null; ownerLabel: string };
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
  date: string;
  accountNumber: string;
  accountName: string;
  totals: { current: number; deposit: number; unallocated: number; total: number };
  control: MandantControl;
}

export interface MandantOwnersParams extends AccountingPeriodParams, PageParams {
  search?: string;
}

export interface MandantOwnerLedgerParams extends AccountingPeriodParams, PageParams {
  /** `thirdPartyAccountId` ou `UNASSIGNED_OWNER`. */
  owner: string;
  nature?: MandantFundsNature;
}

export interface MandantTrialBalanceParams extends PageParams {
  /** Date d'arrêté `YYYY-MM-DD`. */
  date?: string;
  search?: string;
}

// ---------------------------------------------------------------------------
// Appels
// ---------------------------------------------------------------------------

type RawParams = Record<string, string | number | boolean | undefined | null>;

const IDLE: SyncMeta = { status: 'idle', lastSyncedAt: null };

/** Retire les paramètres vides : l'API valide strictement et refuse une chaîne vide là où elle attend un nombre. */
function clean(params: RawParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = typeof value === 'boolean' ? String(value) : value;
  }
  return out;
}

async function read<T>(url: string, params: RawParams): Promise<WithSync<T>> {
  const response = await apiClient.get(url, { params: clean({ ...params, format: 'json' }), noRetry: true });
  const body = response.data as { data: T; meta?: { sync?: SyncMeta } };
  return { ...body.data, sync: body.meta?.sync ?? IDLE };
}

/** Méta — `GET /meta` : journaux, années et bornes de dates disponibles. */
export function getAccountingMeta(tenantId: string): Promise<WithSync<AccountingMeta>> {
  return read<AccountingMeta>(`${BASE(tenantId)}/meta`, {});
}

/** Sélecteur de compte — `GET /accounts`. Résultats limités (20 par défaut, 50 au plus). */
export async function searchAccountingAccounts(
  tenantId: string,
  params: AccountSearchParams
): Promise<AccountOption[]> {
  const data = await read<{ items: AccountOption[] }>(`${BASE(tenantId)}/accounts`, {
    search: params.search,
    withMovements: params.withMovements,
    from: params.from,
    to: params.to,
    limit: params.limit
  });
  return data.items;
}

/** Force la synchronisation des comptes propriétaires et l'attend — `POST /sync`. */
export async function syncAccounting(tenantId: string): Promise<SyncMeta> {
  // Une synchronisation peut durer : même délai que les téléchargements.
  const response = await apiClient.post(`${BASE(tenantId)}/sync`, undefined, { timeout: 120_000 });
  return (response.data?.data as SyncMeta | undefined) ?? IDLE;
}

/** Journal — `GET /journal`, paginé (50 par défaut, 100 au plus). */
export function getJournal(tenantId: string, params: JournalParams): Promise<WithSync<JournalPage>> {
  return read<JournalPage>(`${BASE(tenantId)}/journal`, { ...params });
}

/** Récapitulatif des comptes mouvementés — `GET /general-ledger` sans `account`. */
export function getLedgerSummary(tenantId: string, params: LedgerSummaryParams): Promise<WithSync<LedgerSummaryPage>> {
  return read<LedgerSummaryPage>(`${BASE(tenantId)}/general-ledger`, { ...params });
}

/** Grand livre d'un compte — `GET /general-ledger?account=…`, paginé (100 par défaut). */
export function getAccountLedger(tenantId: string, params: AccountLedgerParams): Promise<WithSync<AccountLedgerPage>> {
  return read<AccountLedgerPage>(`${BASE(tenantId)}/general-ledger`, { ...params });
}

/** Balance générale — `GET /trial-balance`. */
export function getTrialBalance(tenantId: string, params: TrialBalanceParams): Promise<WithSync<TrialBalanceData>> {
  return read<TrialBalanceData>(`${BASE(tenantId)}/trial-balance`, {
    from: params.from,
    to: params.to,
    class: params.accountClass,
    hideZero: params.hideZero,
    search: params.search
  });
}

/** Propriétaires et leurs soldes sur la période — `GET /mandant-subledger` sans `owner`. */
export function getMandantOwners(tenantId: string, params: MandantOwnersParams): Promise<WithSync<MandantOwnersPage>> {
  return read<MandantOwnersPage>(`${BASE(tenantId)}/mandant-subledger`, { ...params });
}

/** Lignes d'un propriétaire — `GET /mandant-subledger?owner=…`, paginé. */
export function getMandantOwnerLedger(
  tenantId: string,
  params: MandantOwnerLedgerParams
): Promise<WithSync<MandantOwnerLedgerPage>> {
  return read<MandantOwnerLedgerPage>(`${BASE(tenantId)}/mandant-subledger`, { ...params });
}

/** Balance auxiliaire des mandants à une date — `GET /mandant-trial-balance`, paginée. */
export function getMandantTrialBalance(
  tenantId: string,
  params: MandantTrialBalanceParams
): Promise<WithSync<MandantTrialBalancePage>> {
  return read<MandantTrialBalancePage>(`${BASE(tenantId)}/mandant-trial-balance`, { ...params });
}

/**
 * Paramètres d'export : les filtres de l'écran, sans pagination (l'export
 * porte toutes les lignes du filtre). Mêmes noms que les lectures ; la balance
 * générale prend `class`, pas `accountClass`.
 */
export type AccountingExportParams = RawParams;

/**
 * Télécharge un export (`csv` ou `xlsx`). L'API attend la synchronisation
 * des comptes propriétaires avant de produire le fichier.
 *
 * Le nom de fichier vient de `Content-Disposition` — `filename*=UTF-8''…`
 * d'abord, `filename="…"` ensuite —, et retombe sur `fallbackName` sinon.
 */
export async function downloadAccountingExport(
  tenantId: string,
  report: AccountingReport,
  format: Exclude<AccountingExportFormat, 'json'>,
  params: AccountingExportParams,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  // L'export porte tout le filtre : la page affichée n'a pas cours.
  const filters: RawParams = { ...params, page: undefined, limit: undefined };
  const response = await apiClient.get<Blob>(`${BASE(tenantId)}/${report}`, {
    params: clean({ ...filters, format }),
    responseType: 'blob'
  });

  const disposition = String(response.headers?.['content-disposition'] ?? '');
  const etendu = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const simple = disposition.match(/filename="?([^";]+)"?/i);

  let filename = fallbackName;
  if (etendu?.[1]) {
    try {
      filename = decodeURIComponent(etendu[1]);
    } catch {
      filename = etendu[1];
    }
  } else if (simple?.[1]) {
    filename = simple[1];
  }

  return { blob: response.data, filename };
}
