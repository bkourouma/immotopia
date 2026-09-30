/**
 * Injection de formule CSV : une seule définition (`lib/csv.ts`
 * `FORMULA_START`) pour l'export courant et l'export complet d'agence.
 */
import { csvCell as sharedCell } from '../../src/lib/csv';
import { csvCell as exportCell } from '../../src/services/tenant-data-export/csv';

const DANGEREUX = [
  '=1+1',
  '+1+1',
  '-1+1',
  '@SUM(A1)',
  '  =1+1',
  ' \t@x',
  '＝1+1',
  '＋1',
  '－1+1',
  '＠x',
  '\t=1',
  '\r=1'
];

describe('préfixe de formule CSV', () => {
  it.each(DANGEREUX)('neutralise %j dans les deux exports', valeur => {
    for (const cell of [sharedCell, exportCell]) {
      const out = cell(valeur as never);
      expect(out.replace(/^"/, '').startsWith("'")).toBe(true);
    }
  });

  it('ne touche ni les nombres ni le texte courant', () => {
    expect(sharedCell(-350000)).toBe('-350000');
    expect(sharedCell('-350000')).toBe('-350000');
    expect(sharedCell('-')).toBe('-');
    expect(sharedCell('Villa Cocody')).toBe('Villa Cocody');
    expect(exportCell(-12)).toBe('-12');
    expect(exportCell('Villa Cocody')).toBe('Villa Cocody');
  });
});
