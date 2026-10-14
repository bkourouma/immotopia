import { describe, expect, it } from 'vitest';
import { knownEnumLabel } from '../../components/copilot/copilot-labels';
import { targetLabelText } from '../../components/copilot/write-plan-format';
import {
  chartXLabel,
  exportableTable,
  formatArtifactAmount,
  formatArtifactCell,
  humanizeFieldName,
  looksLikeUuid,
  sanitizeArtifact,
  toCsv
} from '../../utils/copilot-artifact';

describe('humanizeFieldName', () => {
  it.each([
    ['internalNotes', 'Internal notes'],
    ['owner_name', 'Owner name'],
    ['address.city', 'Address city'],
    ['rentAmountXOF', 'Rent amount xof'],
    ['phone', 'Phone'],
    ['items[0].name', 'Items 0 name'],
    ['Loyer mensuel', 'Loyer mensuel'],
    ['Référence', 'Référence'],
    ['', '']
  ])('%s -> %s', (input, expected) => expect(humanizeFieldName(input)).toBe(expected));
});

describe('looksLikeUuid et libellé de cible', () => {
  const id = 'ffb207fb-2418-42d2-878a-2ce6339a3355';
  it('reconnaît un UUID, pas un nom', () => {
    expect(looksLikeUuid(id)).toBe(true);
    expect(looksLikeUuid(` ${id.toUpperCase()} `)).toBe(true);
    expect(looksLikeUuid('Villa Cocody')).toBe(false);
  });
  it('qualifie un identifiant brut, laisse un nom tel quel', () => {
    expect(targetLabelText(id)).toBe(`Enregistrement (identifiant ${id})`);
    expect(targetLabelText('Villa Cocody')).toBe('Villa Cocody');
  });
});

describe('montants', () => {
  it('0 décimale pour un entier, 2 sinon', () => {
    expect(formatArtifactAmount(90000)).toMatch(/^90\D?000$/);
    expect(formatArtifactAmount(90000.5)).toMatch(/^90\D?000,50$/);
    expect(formatArtifactAmount(1500.25)).toMatch(/^1\D?500,25$/);
    expect(formatArtifactCell(120000.5, 'currency')).toMatch(/,50$/);
  });
  it('ne change pas le format des nombres simples', () => {
    expect(formatArtifactCell(1234.5, 'number')).toMatch(/1\D?234,5$/);
  });
});

describe('en-têtes de graphique', () => {
  const chart = sanitizeArtifact({
    kind: 'chart',
    id: 'c',
    title: 'C',
    chartType: 'bar',
    xKey: 'monthName',
    series: [{ key: 'a', label: 'Encaissé' }],
    data: [{ monthName: 'Mars', a: 1 }]
  });
  it("l'abscisse porte un libellé lisible, la série le sien (CSV compris)", () => {
    if (chart?.kind !== 'chart') throw new Error('chart attendu');
    expect(chartXLabel(chart)).toBe('Month name');
    const data = exportableTable(chart);
    expect(data?.columns.map(c => c.label)).toEqual(['Month name', 'Encaissé']);
    expect(toCsv(data!.columns, data!.rows, ';').split('\r\n')[0]).toBe('Month name;Encaissé');
  });
  it('utilise xLabel quand le serveur le fournit', () => {
    const withLabel = sanitizeArtifact({
      kind: 'chart',
      id: 'c',
      title: 'C',
      chartType: 'line',
      xKey: 'm',
      xLabel: 'Mois',
      series: [{ key: 'a', label: 'A' }],
      data: []
    });
    expect(withLabel?.kind === 'chart' && chartXLabel(withLabel)).toBe('Mois');
  });
});

describe('knownEnumLabel', () => {
  it('traduit exactement un code connu (statut, type)', () => {
    expect(knownEnumLabel('AVAILABLE')).toBe('Disponible');
    expect(knownEnumLabel('RENTED')).toBe('Loué');
    expect(knownEnumLabel('SOLD')).toBe('Vendu');
    expect(knownEnumLabel('ACTIVE')).toBe('Actif');
    expect(knownEnumLabel('MAISON_VILLA')).toBe('Maison / Villa');
  });
  it('laisse tout le reste', () => {
    expect(knownEnumLabel('Available')).toBeNull();
    expect(knownEnumLabel('available')).toBeNull();
    expect(knownEnumLabel('Villa 5')).toBeNull();
    expect(knownEnumLabel('INCONNU_XYZ')).toBeNull();
    expect(knownEnumLabel('')).toBeNull();
  });
});
