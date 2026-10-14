import { describe, expect, it } from 'vitest';
import {
  compareCells,
  csvSeparator,
  formatArtifactCell,
  neutralizeFormula,
  safeFilename,
  sanitizeArtifact,
  toCsv
} from '../../utils/copilot-artifact';

describe('sanitizeArtifact', () => {
  it('accepte un tableau, un texte et un graphique bien formés', () => {
    expect(
      sanitizeArtifact({ kind: 'table', id: 't', title: 'T', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 1 }] })
    ).toMatchObject({ kind: 'table', rows: [{ a: 1 }] });
    expect(sanitizeArtifact({ kind: 'markdown', id: 'm', title: 'M', content: 'x' })).toMatchObject({
      kind: 'markdown'
    });
    expect(
      sanitizeArtifact({
        kind: 'chart',
        id: 'c',
        title: 'C',
        chartType: 'bar',
        xKey: 'x',
        series: [{ key: 'y', label: 'Y' }],
        data: [{ x: 'a', y: 2 }]
      })
    ).toMatchObject({ kind: 'chart', chartType: 'bar' });
  });

  it('ignore ce qui est mal formé', () => {
    expect(sanitizeArtifact(null)).toBeNull();
    expect(sanitizeArtifact({ kind: 'table', id: 't', title: 'T' })).toBeNull();
    expect(sanitizeArtifact({ kind: 'table', id: '', title: 'T', columns: [], rows: [] })).toBeNull();
    expect(sanitizeArtifact({ kind: 'inconnu', id: 'x', title: 'T' })).toBeNull();
    expect(
      sanitizeArtifact({ kind: 'chart', id: 'c', title: 'C', chartType: 'radar', xKey: 'x', series: [], data: [] })
    ).toBeNull();
  });

  it('tronque aux limites de l’API et nettoie les cellules', () => {
    const columns = Array.from({ length: 30 }, (_, i) => ({ key: `c${i}`, label: `C${i}` }));
    const rows = Array.from({ length: 600 }, (_, i) => ({ c0: i, c1: { x: 1 } as unknown as string }));
    const table = sanitizeArtifact({ kind: 'table', id: 't', title: 'T', columns, rows });
    if (table?.kind !== 'table') throw new Error('table attendue');
    expect(table.columns).toHaveLength(20);
    expect(table.rows).toHaveLength(500);
    expect(table.truncated).toBe(true);
    expect(table.rows[0].c1).toBeNull();

    const md = sanitizeArtifact({ kind: 'markdown', id: 'm', title: 'M', content: 'a'.repeat(30000) });
    if (md?.kind !== 'markdown') throw new Error('texte attendu');
    expect(md.content).toHaveLength(20000);

    const chart = sanitizeArtifact({
      kind: 'chart',
      id: 'c',
      title: 'C',
      chartType: 'line',
      xKey: 'x',
      series: Array.from({ length: 9 }, (_, i) => ({ key: `s${i}`, label: `S${i}` })),
      data: Array.from({ length: 300 }, (_, i) => ({ x: String(i) }))
    });
    if (chart?.kind !== 'chart') throw new Error('graphique attendu');
    expect(chart.series).toHaveLength(6);
    expect(chart.data).toHaveLength(200);
  });
});

describe('CSV', () => {
  it('préfixe d’une apostrophe les cellules texte qui ressemblent à une formule', () => {
    for (const bad of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx']) {
      expect(neutralizeFormula(bad)).toBe(`'${bad}`);
    }
    expect(neutralizeFormula('Villa')).toBe('Villa');
    expect(neutralizeFormula('a=b')).toBe('a=b');
  });

  it('neutralise les formules dans les valeurs et dans les en-têtes', () => {
    const csv = toCsv([{ key: 'a', label: '=HEADER' }], [{ a: '=cmd|calc' }, { a: -5 }, { a: null }], ',');
    expect(csv).toBe("'=HEADER\r\n'=cmd|calc\r\n-5\r\n");
  });

  it('échappe guillemets, séparateurs et sauts de ligne', () => {
    const csv = toCsv(
      [
        { key: 'a', label: 'Nom' },
        { key: 'b', label: 'Note' }
      ],
      [{ a: 'Dupont; Jean', b: 'dit "oui"\nok' }],
      ';'
    );
    expect(csv).toBe('Nom;Note\r\n"Dupont; Jean";"dit ""oui""\nok"');
  });

  it('utilise la virgule décimale avec « ; » et choisit le séparateur selon la langue', () => {
    expect(toCsv([{ key: 'a', label: 'A' }], [{ a: 12.5 }], ';')).toBe('A\r\n12,5');
    expect(toCsv([{ key: 'a', label: 'A' }], [{ a: 12.5 }], ',')).toBe('A\r\n12.5');
    expect(csvSeparator('fr-FR')).toBe(';');
    expect(csvSeparator('ar')).toBe(';');
    expect(csvSeparator('en-US')).toBe(',');
  });
});

describe('mise en forme', () => {
  it('formate nombre, date et vide', () => {
    expect(formatArtifactCell(null, 'number')).toBe('');
    expect(formatArtifactCell(1234.5, 'number')).toMatch(/1\D?234[,.]5/);
    expect(formatArtifactCell('2026-03-05', 'date')).toBe('05/03/2026');
    expect(formatArtifactCell('pas une date', 'date')).toBe('pas une date');
    expect(formatArtifactCell('<b>x</b>')).toBe('<b>x</b>');
  });

  it('trie en plaçant les vides en dernier', () => {
    expect(compareCells(2, 10)).toBeLessThan(0);
    expect(compareCells('a2', 'a10')).toBeLessThan(0);
    expect(compareCells(null, 1)).toBeGreaterThan(0);
    expect(compareCells(1, null)).toBeLessThan(0);
  });
});

describe('safeFilename', () => {
  it('assainit les noms de fichiers', () => {
    expect(safeFilename('Loyers / mars 2026')).toBe('Loyers-mars-2026');
    expect(safeFilename('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFilename('Écarts Été')).toBe('Écarts-Été');
    expect(safeFilename('***')).toBe('artefact');
    expect(safeFilename('a'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});
