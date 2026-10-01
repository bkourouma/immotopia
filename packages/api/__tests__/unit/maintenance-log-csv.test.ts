/**
 * `lib/patrimoine/insurance/maintenance-log-csv.ts` : BOM UTF-8, séparateur
 * `;`, colonnes fixes, neutralisation des formules (lot B1, spec 032).
 */
import {
  MAINTENANCE_LOG_CSV_HEADER,
  buildMaintenanceLogCsv,
  type MaintenanceLogCsvRow
} from '../../src/lib/patrimoine/insurance/maintenance-log-csv';

function row(overrides: Partial<MaintenanceLogCsvRow> = {}): MaintenanceLogCsvRow {
  return {
    performedAt: '2026-09-01T00:00:00.000Z',
    category: 'ELECTRICAL',
    vendorName: 'Élec Plus',
    cost: 15000.5,
    currency: 'XOF',
    description: 'Tableau électrique',
    nextDueDate: '2027-09-01T00:00:00.000Z',
    warrantyEndDate: null,
    ...overrides
  };
}

describe('buildMaintenanceLogCsv', () => {
  it('commence par le BOM UTF-8 puis une en-tête fixe séparée par des points-virgules', () => {
    const csv = buildMaintenanceLogCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(MAINTENANCE_LOG_CSV_HEADER.join(';'));
    expect(MAINTENANCE_LOG_CSV_HEADER).toHaveLength(8);
  });

  it('écrit les dates au jour, la catégorie en français et laisse vide une valeur absente', () => {
    const lines = buildMaintenanceLogCsv([row()]).slice(1).split('\r\n');
    expect(lines[1]).toBe('2026-09-01;Électricité;Élec Plus;15000.5;XOF;Tableau électrique;2027-09-01;');
  });

  it('entoure de guillemets une cellule qui contient le séparateur ou un saut de ligne', () => {
    const csv = buildMaintenanceLogCsv([row({ description: 'a;b\nc "d"' })]);
    expect(csv).toContain('"a;b\nc ""d"""');
  });

  it.each(['=SUM(A1:A2)', '+33123456789 x', '-cmd|x', '@HYPERLINK("x")'])(
    "neutralise l'injection de formule : %s",
    value => {
      const csv = buildMaintenanceLogCsv([row({ description: value, vendorName: value })]);
      const dataLine = csv.split('\r\n')[1];
      expect(dataLine).not.toMatch(/(^|;)"?[=+\-@]/);
      expect(dataLine).toContain(`'${value.charAt(0)}`);
    }
  );
});
