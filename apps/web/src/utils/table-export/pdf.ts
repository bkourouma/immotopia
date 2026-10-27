import { t } from '../../i18n/t';
import type { ExportTable, WriterOptions } from './types';

/**
 * PDF : jsPDF + autoTable (chargés à la demande), A4, paysage au-delà de
 * 6 colonnes, titre, date de génération localisée, en-têtes répétés, pied
 * « Page x / y ».
 *
 * Les polices standard de jsPDF ne couvrent que le Latin-1. Quand la langue
 * est l'arabe ou qu'un texte sort du Latin-1 (après remplacement des
 * typographies courantes), `needsPrintFallback` le dit et l'appelant bascule
 * sur `printTable` (repli impression).
 */

export const LANDSCAPE_THRESHOLD = 6;

const REPLACEMENTS: [RegExp, string][] = [
  [/[\u2010-\u2015\u2212]/g, '-'],
  [/[\u2018\u2019\u201a\u201b]/g, "'"],
  [/[\u201c\u201d\u201e\u201f]/g, '"'],
  [/\u2026/g, '...'],
  [/\u2192/g, '->'],
  [/\u2190/g, '<-'],
  [/\u0153/g, 'oe'],
  [/\u0152/g, 'OE'],
  [/\u20ac/g, 'EUR'],
  [/[\u2022\u00b7\u2219]/g, '-'],
  // Marques bidi et caractères de largeur nulle, invisibles et hors Latin-1.
  [/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '']
];

/** Texte ramené, autant que possible, dans le Latin-1 que jsPDF sait écrire. */
export function toPdfText(text: string): string {
  let out = text.normalize('NFC');
  for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);
  return out;
}

export function isLatin1(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return !/[^\u0000-ÿ]/.test(text);
}

export function needsPrintFallback(table: ExportTable, title: string, language: string): boolean {
  if (language === 'ar') return true;
  if (!isLatin1(toPdfText(title))) return true;
  if (table.columns.some(c => !isLatin1(toPdfText(c.header)))) return true;
  return table.rows.some(row => row.some(cell => !isLatin1(toPdfText(cell.text))));
}

export function generatedOn(locale: string, now: Date = new Date()): string {
  return t('Généré le {{date}}', {
    date: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(now)
  });
}

export async function buildPdfBlob(table: ExportTable, opts: WriterOptions): Promise<Blob> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableModule.default;

  const landscape = table.columns.length > LANDSCAPE_THRESHOLD;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const margin = 12;

  doc.setFontSize(14);
  doc.text(toPdfText(opts.title), margin, 16);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(toPdfText(generatedOn(opts.locale)), margin, 22);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 27,
    margin: { left: margin, right: margin, top: 14, bottom: 14 },
    head: [table.columns.map(c => toPdfText(c.header))],
    body: table.rows.map(row =>
      row.map(cell => (cell.indent ? `${'  '.repeat(cell.indent)}${toPdfText(cell.text)}` : toPdfText(cell.text)))
    ),
    styles: { fontSize: landscape ? 8 : 9, cellPadding: 1.8, overflow: 'linebreak' },
    headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(table.columns.map((c, i) => [i, c.numeric ? { halign: 'right' as const } : {}])),
    showHead: 'everyPage'
  });

  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(110);
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.text(toPdfText(t('Page {{page}} / {{total}}', { page, total: pages })), width / 2, height - 6, {
      align: 'center'
    });
  }

  return doc.output('blob');
}
