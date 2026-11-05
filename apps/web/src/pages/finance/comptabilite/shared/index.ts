/**
 * Cadre commun des sous-pages de la comptabilité de l'agence.
 *
 * - `<AccountingFrame sync actions filters>` : note, période (URL `from`/`to`)
 *   et raccourcis, filtres de la page, synchronisation, devise.
 * - `useAccountingPeriod()` → `{ from, to, setPeriod(from, to) }` ; changer la
 *   période retire `page` de l'URL.
 * - `useAccountingSync(tenantId, sync)`, `<SyncBanner state />`,
 *   `<SyncStatus state />` : intégrés au cadre ; à n'utiliser seuls que hors cadre.
 * - `useAccountingMeta(tenantId)` : journaux, années, bornes de dates.
 * - `useAccountingExport(tenantId)` → `{ exportEnCours, exporter }` et
 *   `<ExportButtons loadingKey onExport />`.
 * - `accountingQueryKey(name, tenantId, params)`, `ACCOUNTING_QUERY_PREFIX`,
 *   `ACCOUNTING_PAGE_SIZE`, `dateCourte(iso)`.
 */
export { AccountingFrame } from './AccountingFrame';
export type { AccountingFrameProps } from './AccountingFrame';
export { useAccountingPeriod, PERIOD_FROM_KEY, PERIOD_TO_KEY } from './useAccountingPeriod';
export { useAccountingSync, SyncBanner, SyncStatus, SYNC_POLL_INTERVAL_MS } from './useAccountingSync';
export type { AccountingSyncState } from './useAccountingSync';
export { useAccountingMeta } from './useAccountingMeta';
export { useAccountingExport, ExportButtons } from './useAccountingExport';
export type { ExportFormat } from './useAccountingExport';
export {
  ACCOUNTING_QUERY_PREFIX,
  ACCOUNTING_PAGE_SIZE,
  accountingQueryKey,
  isAccountingQuery,
  dateCourte
} from './accounting-query';
