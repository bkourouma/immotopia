import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { resolveExportColumns } from '../../utils/table-export/columns';
import { buildExportTable, typeCell } from '../../utils/table-export/build-table';
import { toCsvString } from '../../utils/table-export/csv';
import { collectAllPages } from '../../utils/table-export/collect';
import { exportFilename } from '../../utils/table-export/filename';
import { needsPrintFallback, toPdfText } from '../../utils/table-export/pdf';
import { buildPrintHtml, escapeHtml } from '../../utils/table-export/print';
import { sheetName } from '../../utils/table-export/excel';
import type { ColumnsType } from 'antd/es/table/interface';
import type { ExportTable } from '../../utils/table-export/types';

type Row = { id: string; nom: string; prix?: number | string; tel?: string; a?: { b?: string }; children?: Row[] };

describe('résolution des colonnes exportables', () => {
  it('exclut les colonnes d’actions, sans titre texte ou marquées exportable:false', () => {
    const columns: ColumnsType<Row> = [
      { title: 'Nom', dataIndex: 'nom' },
      { title: 'Actions', key: 'actions', render: () => null },
      { title: 'Ops', key: 'operations', render: () => null },
      { title: <b>Sans texte</b>, dataIndex: 'prix' },
      { title: 'Caché', dataIndex: 'tel', exportable: false },
      { title: 'Action', dataIndex: 'action' as never }
    ];
    expect(resolveExportColumns(columns).map(c => c.header)).toEqual(['Nom']);
  });

  it('utilise exportTitle quand le titre n’est pas une chaîne', () => {
    const columns: ColumnsType<Row> = [{ title: <b>Prix</b>, exportTitle: 'Prix (FCFA)', dataIndex: 'prix' }];
    expect(resolveExportColumns(columns).map(c => c.header)).toEqual(['Prix (FCFA)']);
  });

  it('aplatit les groupes en « Parent – Enfant »', () => {
    const columns: ColumnsType<Row> = [
      {
        title: 'Montants',
        children: [
          { title: 'Loyer', dataIndex: 'prix' },
          { title: 'Charges', dataIndex: 'tel' }
        ]
      }
    ];
    expect(resolveExportColumns(columns).map(c => c.header)).toEqual(['Montants – Loyer', 'Montants – Charges']);
  });

  it('lit une valeur par chemin de dataIndex et priorise exportValue', async () => {
    const columns: ColumnsType<Row> = [
      { title: 'Chemin', dataIndex: ['a', 'b'] },
      { title: 'Valeur', dataIndex: 'nom', exportValue: r => `${r.nom}!` },
      { title: 'Rendu', dataIndex: 'nom', render: v => `rendu-${v}` }
    ];
    const table = await buildExportTable(columns, [{ id: '1', nom: 'x', a: { b: 'profond' } }]);
    expect(table.rows[0].map(c => c.text)).toEqual(['profond', 'x!', 'rendu-x']);
  });

  it('passe l’enregistrement comme valeur à render quand la colonne n’a pas de dataIndex (comme Ant Design)', async () => {
    const columns: ColumnsType<Row> = [{ title: 'Sans index', key: 'si', render: (v: Row) => `rendu-${v.nom}` }];
    const table = await buildExportTable(columns, [{ id: '1', nom: 'x' }]);
    expect(table.rows[0].map(c => c.text)).toEqual(['rendu-x']);
  });

  it('aplatit les lignes enfants avec un retrait sur la première colonne', async () => {
    const columns: ColumnsType<Row> = [{ title: 'Nom', dataIndex: 'nom' }];
    const table = await buildExportTable(columns, [
      { id: '1', nom: 'parent', children: [{ id: '2', nom: 'enfant', children: [{ id: '3', nom: 'petit' }] }] }
    ]);
    expect(table.rows.map(r => [r[0].text, r[0].indent ?? 0])).toEqual([
      ['parent', 0],
      ['enfant', 1],
      ['petit', 2]
    ]);
  });

  it('retombe sur la valeur brute quand render lève, et lit le texte d’un élément via renderNodes', async () => {
    const columns: ColumnsType<Row> = [
      {
        title: 'Boom',
        dataIndex: 'nom',
        render: () => {
          throw new Error('boom');
        }
      },
      { title: 'Elt', dataIndex: 'nom', render: v => <b>{v}</b> }
    ];
    const renderNodes = vi.fn(async (nodes: React.ReactNode[]) => nodes.map(() => ' mis en   forme  '));
    const table = await buildExportTable(columns, [{ id: '1', nom: 'brut' }], { renderNodes });
    expect(table.rows[0][0].text).toBe('brut');
    expect(table.rows[0][1].text).toBe('mis en forme');
    expect(renderNodes).toHaveBeenCalledTimes(1);
  });

  it('monte les cellules par paquets', async () => {
    const columns: ColumnsType<Row> = [{ title: 'Elt', dataIndex: 'nom', render: v => <i>{v}</i> }];
    const rows = Array.from({ length: 650 }, (_, i) => ({ id: String(i), nom: `n${i}` }));
    const sizes: number[] = [];
    await buildExportTable(columns, rows, {
      renderNodes: async nodes => {
        sizes.push(nodes.length);
        return nodes.map(() => 'x');
      }
    });
    expect(sizes).toEqual([300, 300, 50]);
  });
});

describe('typage des nombres', () => {
  it('garde un nombre fini', () => {
    expect(typeCell(42, '42')).toMatchObject({ kind: 'number', value: 42 });
  });
  it('convertit une chaîne décimale dont le rendu est formaté', () => {
    expect(typeCell('125000', '125 000')).toMatchObject({ kind: 'number', value: 125000 });
    expect(typeCell('1250.50', '1 250,50 FCFA')).toMatchObject({ kind: 'number', value: 1250.5 });
  });
  it('laisse en texte une référence ou un téléphone affichés tels quels', () => {
    expect(typeCell('12345', '12345')).toMatchObject({ kind: 'text', value: '12345' });
    expect(typeCell('0707070707', '07 07 07 07 07')).toMatchObject({ kind: 'text' });
    expect(typeCell('12345', null)).toMatchObject({ kind: 'text' });
  });
  it('marque les colonnes numériques et entières', async () => {
    const columns: ColumnsType<Row> = [{ title: 'Prix', dataIndex: 'prix' }];
    const table = await buildExportTable(columns, [
      { id: '1', nom: 'a', prix: 10 },
      { id: '2', nom: 'b', prix: 2.5 }
    ]);
    expect(table.columns[0]).toMatchObject({ numeric: true, integer: false });
  });
});

describe('tiret de remplissage', () => {
  it('« - », « – » et « — » (avec ou sans espaces) donnent une cellule vide', () => {
    for (const tiret of ['-', '–', '—', ' - ', ' — ', '\t–']) {
      expect(typeCell(tiret, tiret)).toEqual({ text: '', value: null, kind: 'empty' });
      expect(typeCell(tiret, null)).toEqual({ text: '', value: null, kind: 'empty' });
    }
  });

  it('un tiret n’est vidé que s’il est seul : « -5 », « -1+2 » et « a-b » restent du texte', () => {
    expect(typeCell('-5', '-5')).toMatchObject({ kind: 'text', text: '-5' });
    expect(typeCell('-1+2', '-1+2')).toMatchObject({ kind: 'text', text: '-1+2' });
    expect(typeCell('a-b', 'a-b')).toMatchObject({ kind: 'text', text: 'a-b' });
    expect(typeCell('--', '--')).toMatchObject({ kind: 'text' });
  });

  it('un nombre négatif reste un nombre', () => {
    expect(typeCell(-5, '-5')).toMatchObject({ kind: 'number', value: -5 });
  });

  it('colonnes à rendu texte, à rendu élément et à exportValue : tiret vidé, CSV sans apostrophe', async () => {
    type Ligne = { id: string; note?: string; ref?: string; tel?: string; delta: string };
    const columns: ColumnsType<Ligne> = [
      { title: 'Rendu texte', dataIndex: 'note', render: (v?: string) => v || '-' },
      { title: 'Rendu élément', dataIndex: 'ref', render: (v?: string) => <span>{v || '–'}</span> },
      { title: 'Valeur d’export', dataIndex: 'tel', exportValue: r => r.tel || '—' },
      { title: 'Brut', dataIndex: 'delta' }
    ];
    const rows: Ligne[] = [
      { id: '1', delta: '-', note: undefined },
      { id: '2', delta: '-1+2', note: '=1+1', ref: '@SUM(A1)', tel: '+22501' }
    ];
    // Les éléments montés rendent « – » pour la 1re ligne, « @SUM(A1) » pour la 2e.
    const table = await buildExportTable(columns, rows, {
      renderNodes: async nodes => nodes.map((_, i) => (i === 0 ? '–' : '@SUM(A1)'))
    });

    // Ligne 1 : quatre cellules vides.
    expect(table.rows[0].map(c => c.kind)).toEqual(['empty', 'empty', 'empty', 'empty']);

    const csv = toCsvString(table, 'fr');
    const [, premiere, seconde] = csv.slice(1).split('\r\n');
    expect(premiere).toBe(';;;');

    // Ligne 2 : la neutralisation des formules reste entière.
    expect(seconde).toBe("'=1+1;'@SUM(A1);'+22501;'-1+2");
  });

  it('neutralise toujours « =1+1 », « +1 », « -1+2 », « @SUM », tabulation et retour chariot en tête', () => {
    const colonne: ExportTable['columns'] = [{ header: 'Valeur', numeric: false, integer: true }];
    const cellule = (texte: string) => typeCell(texte, texte);
    for (const mauvais of ['=1+1', '+1', '-1+2', '@SUM(A1)']) {
      const table: ExportTable = { columns: colonne, rows: [[cellule(mauvais)]] };
      const champ = toCsvString(table, 'fr').slice(1).split('\r\n')[1];
      expect(champ.replace(/^"|"$/g, '').startsWith("'")).toBe(true);
    }
    // typeCell normalise les blancs en tête : les contrôles sont supprimés avant l'export.
    for (const controle of ['\tx', '\rx']) {
      const table: ExportTable = { columns: colonne, rows: [[cellule(controle)]] };
      expect(toCsvString(table, 'fr').slice(1).split('\r\n')[1]).toBe('x');
    }
  });
});

describe('CSV', () => {
  const table: ExportTable = {
    columns: [
      { header: 'Nom', numeric: false, integer: true },
      { header: 'Prix', numeric: true, integer: false }
    ],
    rows: [
      [
        { text: 'Dupont; "Jean"', value: 'Dupont; "Jean"', kind: 'text' },
        { text: '1 250,5 FCFA', value: 1250.5, kind: 'number' }
      ],
      [
        { text: '=SOMME(A1)', value: '=SOMME(A1)', kind: 'text' },
        { text: '1 000', value: 1000, kind: 'number' }
      ],
      [
        { text: 'ligne\nsuivante', value: 'ligne\nsuivante', kind: 'text' },
        { text: '', value: null, kind: 'empty' }
      ]
    ]
  };

  it('écrit BOM, séparateur « ; », CRLF et guillemets RFC 4180', () => {
    const csv = toCsvString(table, 'fr');
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Nom;Prix');
    expect(lines[1]).toBe('"Dupont; ""Jean""";1250,5');
  });

  it('neutralise les formules et écrit les nombres sans séparateur de milliers', () => {
    const csv = toCsvString(table, 'fr');
    expect(csv).toContain("'=SOMME(A1);1000");
    expect(csv).toContain('"ligne\nsuivante";');
  });

  it('utilise le point décimal en anglais', () => {
    expect(toCsvString(table, 'en')).toContain(';1250.5');
  });
});

describe('collectAllPages', () => {
  it('s’arrête au total annoncé', async () => {
    const fetchPage = vi.fn(async (page: number) => ({
      items: page <= 2 ? Array.from({ length: 100 }, (_, i) => i) : Array.from({ length: 20 }, (_, i) => i),
      total: 220
    }));
    const result = await collectAllPages(fetchPage);
    expect(result.items).toHaveLength(220);
    expect(result.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenLastCalledWith(3, 100);
  });

  it('s’arrête sur une page vide', async () => {
    const fetchPage = vi.fn(async (page: number) => ({ items: page === 1 ? [1, 2] : [], total: 99 }));
    const result = await collectAllPages(fetchPage);
    expect(result.items).toEqual([1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('plafonne à 10 000 lignes et le signale', async () => {
    const fetchPage = async (_page: number, limit: number) => ({
      items: Array.from({ length: limit }, (_, i) => i),
      total: 50_000
    });
    const result = await collectAllPages(fetchPage);
    expect(result.items).toHaveLength(10_000);
    expect(result.truncated).toBe(true);
  });

  it('ne signale pas un plafond atteint pile sur le total', async () => {
    const result = await collectAllPages(async () => ({ items: [1, 2, 3], total: 3 }), { maxRows: 3 });
    expect(result.truncated).toBe(false);
  });
});

describe('noms et écrivains', () => {
  it('nomme le fichier <base>-AAAA-MM-JJ.<ext>', () => {
    expect(exportFilename('Baux de l’agence / 2026', 'xlsx', new Date(2026, 9, 5))).toBe(
      'Baux-de-l-agence-2026-2026-10-05.xlsx'
    );
  });

  it('assainit le nom de feuille Excel (31 caractères, sans caractères interdits)', () => {
    const name = sheetName('Baux: [liste] / très très très long nom de feuille');
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[[\]:*?/\\]/);
  });

  it('bascule sur le repli impression en arabe ou hors Latin-1', () => {
    const latin: ExportTable = {
      columns: [{ header: 'Nom – Prénom', numeric: false, integer: true }],
      rows: [[{ text: 'Éloïse → Œuvre', value: 'x', kind: 'text' }]]
    };
    expect(needsPrintFallback(latin, 'Baux', 'fr')).toBe(false);
    expect(needsPrintFallback(latin, 'Baux', 'ar')).toBe(true);
    const arabic: ExportTable = { ...latin, rows: [[{ text: 'عقار', value: 'عقار', kind: 'text' }]] };
    expect(needsPrintFallback(arabic, 'Baux', 'fr')).toBe(true);
    expect(toPdfText('a – b → c…')).toBe('a - b -> c...');
  });

  it('échappe le HTML du repli impression', () => {
    expect(escapeHtml('<img src=x onerror="a">&')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;&amp;');
    const html = buildPrintHtml(
      {
        columns: [{ header: '<b>H</b>', numeric: false, integer: true }],
        rows: [[{ text: '<script>alert(1)</script>', value: 'x', kind: 'text' }]]
      },
      { title: '<t>', language: 'ar', locale: 'ar' }
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>H</b>');
    expect(html).toContain('dir="rtl"');
  });
});
