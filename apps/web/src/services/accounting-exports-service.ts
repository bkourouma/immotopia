import apiClient from '../utils/api-client';

/**
 * Exports comptables — Lot 8 (scratchpad `lot8-contrat-api.md`).
 *
 * Comptabilité **opérationnelle** de l'agence (gestion locative, fournisseurs,
 * chantiers…), pas celle des copropriétés — qui a son propre module
 * (`services/syndic-service.ts`). Trois lectures (journal, grand livre,
 * balance générale) et un téléchargement de fichier partagé par les trois.
 *
 * Écrit contre le contrat, l'API n'existant pas encore : mêmes types, mêmes
 * routes, même enveloppe `{ success, data }` que les autres services finance
 * (`finance-service.ts`).
 */

const BASE = (tenantId: string) => `/tenants/${tenantId}/finance/accounting`;

export type AccountingExportFormat = 'json' | 'csv' | 'xlsx';
export type AccountingReport = 'journal' | 'general-ledger' | 'trial-balance';

/** Bornes de période communes aux trois lectures. `from`/`to` au format `YYYY-MM-DD`. */
export interface AccountingPeriodParams {
  from?: string;
  to?: string;
}

export interface AccountingJournalRef {
  code: string;
  label: string;
}

export interface JournalEntryLine {
  accountNumber: string;
  accountName: string;
  label: string;
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
  lines: JournalEntryLine[];
}

export interface JournalData {
  from: string;
  to: string;
  /** Options du filtre par journal. */
  journals: AccountingJournalRef[];
  entries: JournalEntry[];
  totals: { debit: number; credit: number };
}

export interface GeneralLedgerLine {
  date: string;
  journalCode: string;
  reference: string;
  label: string;
  debit: number;
  credit: number;
  /** Solde progressif, déjà calculé côté serveur. */
  balance: number;
}

export interface GeneralLedgerAccount {
  accountNumber: string;
  accountName: string;
  /** Solde au jour précédant `from` (débit − crédit). */
  openingBalance: number;
  lines: GeneralLedgerLine[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface GeneralLedgerData {
  from: string;
  to: string;
  accounts: GeneralLedgerAccount[];
}

export interface TrialBalanceLine {
  accountNumber: string;
  accountName: string;
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
  lines: TrialBalanceLine[];
  totals: TrialBalanceTotals;
  isBalanced: boolean;
}

/** Journal — `GET /journal`. Paramètre facultatif : `journal` (code). */
export async function getJournal(
  tenantId: string,
  params: AccountingPeriodParams & { journal?: string }
): Promise<JournalData> {
  const response = await apiClient.get(`${BASE(tenantId)}/journal`, {
    params: { from: params.from, to: params.to, journal: params.journal || undefined, format: 'json' }
  });
  return response.data.data;
}

/** Grand livre — `GET /general-ledger`. Paramètre facultatif : `account` (numéro). */
export async function getGeneralLedger(
  tenantId: string,
  params: AccountingPeriodParams & { account?: string }
): Promise<GeneralLedgerData> {
  const response = await apiClient.get(`${BASE(tenantId)}/general-ledger`, {
    params: { from: params.from, to: params.to, account: params.account || undefined, format: 'json' }
  });
  return response.data.data;
}

/** Balance générale — `GET /trial-balance`. */
export async function getTrialBalance(tenantId: string, params: AccountingPeriodParams): Promise<TrialBalanceData> {
  const response = await apiClient.get(`${BASE(tenantId)}/trial-balance`, {
    params: { from: params.from, to: params.to, format: 'json' }
  });
  return response.data.data;
}

const REPORT_ROUTES: Record<AccountingReport, string> = {
  journal: 'journal',
  'general-ledger': 'general-ledger',
  'trial-balance': 'trial-balance'
};

/**
 * Télécharge un export (`csv` ou `xlsx`) d'une des trois lectures.
 *
 * Passe par `apiClient`, comme `rental-service.downloadDocument` : délai
 * maximal, rafraîchissement de session sur 401 et nouvelles tentatives, là où
 * un `fetch` brut n'offre rien de tout cela.
 *
 * Le nom de fichier vient de l'en-tête `Content-Disposition` quand le serveur
 * le fournit — `filename*=UTF-8''…` d'abord, seule forme qui porte les
 * accents, `filename="…"` ensuite —, et retombe sur `fallbackName` sinon.
 */
export async function downloadAccountingExport(
  tenantId: string,
  report: AccountingReport,
  format: Exclude<AccountingExportFormat, 'json'>,
  params: AccountingPeriodParams & { journal?: string; account?: string },
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(`${BASE(tenantId)}/${REPORT_ROUTES[report]}`, {
    params: {
      from: params.from,
      to: params.to,
      journal: params.journal || undefined,
      account: params.account || undefined,
      format
    },
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
