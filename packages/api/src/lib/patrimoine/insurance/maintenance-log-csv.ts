import { MaintenanceLogCategory } from '@prisma/client';
import { toCsvString, type CsvValue } from '../../csv';
import { MAINTENANCE_LOG_CATEGORY_LABELS } from './labels';

/**
 * Export CSV du carnet d'entretien (lot B1, spec 032) : UTF-8 avec BOM,
 * séparateur `;`, colonnes fixes. L'échappement et la neutralisation des
 * formules (préfixe `'` devant `= + - @`) sont ceux de `lib/csv.ts`.
 */

export const MAINTENANCE_LOG_CSV_HEADER = [
  'Date',
  'Catégorie',
  'Prestataire',
  'Coût',
  'Devise',
  'Description',
  'Prochaine échéance',
  'Fin de garantie'
] as const;

export interface MaintenanceLogCsvRow {
  performedAt: string;
  category: MaintenanceLogCategory;
  vendorName: string | null;
  cost: number | null;
  currency: string;
  description: string;
  nextDueDate: string | null;
  warrantyEndDate: string | null;
}

const toDay = (iso: string | null): string => (iso ? iso.slice(0, 10) : '');

export function buildMaintenanceLogCsv(rows: MaintenanceLogCsvRow[]): string {
  const lines: CsvValue[][] = [
    [...MAINTENANCE_LOG_CSV_HEADER],
    ...rows.map(row => [
      toDay(row.performedAt),
      MAINTENANCE_LOG_CATEGORY_LABELS[row.category] ?? row.category,
      row.vendorName,
      row.cost,
      row.currency,
      row.description,
      toDay(row.nextDueDate),
      toDay(row.warrantyEndDate)
    ])
  ];
  return toCsvString(lines, { separator: ';' });
}
