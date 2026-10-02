import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import { drawDocumentHeader, fontsOf, resolveDocumentBranding, truncate } from '../../documents/document-branding';
import { money } from '../../finance/statement-pdf';
import { currentLanguage, t, type Language } from '../../../i18n';
import type { NetWorthExportData } from './net-worth-data';
import { assetClassLabel, exclusionReasonLabel, reliabilityLabel } from './net-worth-labels';

/**
 * PDF de la situation patrimoniale (lot 5) : valeur nette, répartition par
 * classe, actifs, dettes, actifs non comptés et historique.
 *
 * Même conception que `pdf.ts` (lot P3) : A4 multipage, en-tête de marque sur
 * la première page, pied « page n / N ». Les polices standard de pdf-lib
 * n'encodent pas l'arabe : le PDF est forcé en français quand la requête est
 * en arabe (le classeur Excel reste dans la langue demandée).
 */

const PAGE_SIZE: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const BOTTOM_MARGIN = 56;
const LINE_HEIGHT = 12;
const CONTENT_WIDTH = PAGE_SIZE[0] - 2 * MARGIN;
const GREY = rgb(0.4, 0.4, 0.4);
const RED = rgb(0.6, 0.15, 0.15);

interface Writer {
  pdfDoc: PDFDocument;
  fonts: { regular: PDFFont; bold: PDFFont };
  page: PDFPage;
  y: number;
  language: Language;
}

interface Column {
  header: string;
  width: number;
  /** Aligné à droite (montants). */
  end?: boolean;
}

function newPage(w: Writer) {
  w.page = w.pdfDoc.addPage(PAGE_SIZE);
  w.y = PAGE_SIZE[1] - MARGIN;
}

function ensureSpace(w: Writer, needed: number) {
  if (w.y - needed < BOTTOM_MARGIN) newPage(w);
}

function line(w: Writer, text: string, opts: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> } = {}) {
  ensureSpace(w, LINE_HEIGHT);
  const font = opts.bold ? w.fonts.bold : w.fonts.regular;
  const size = opts.size ?? 9;
  w.page.drawText(truncate(text || ' ', font, size, CONTENT_WIDTH), {
    x: MARGIN,
    y: w.y,
    size,
    font,
    color: opts.color
  });
  w.y -= LINE_HEIGHT;
}

function sectionTitle(w: Writer, text: string) {
  ensureSpace(w, LINE_HEIGHT * 3 + 8);
  w.y -= 8;
  line(w, text, { bold: true, size: 12 });
  w.y -= 2;
}

function tableRow(
  w: Writer,
  columns: Column[],
  cells: string[],
  opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}
) {
  ensureSpace(w, LINE_HEIGHT);
  const font = opts.bold ? w.fonts.bold : w.fonts.regular;
  const size = 8;
  let x = MARGIN;
  columns.forEach((column, index) => {
    const text = truncate(cells[index] || ' ', font, size, column.width - 6);
    const drawX = column.end ? x + column.width - 6 - font.widthOfTextAtSize(text, size) : x;
    w.page.drawText(text, { x: drawX, y: w.y, size, font, color: opts.color });
    x += column.width;
  });
  w.y -= LINE_HEIGHT;
}

/** En-tête de tableau, redessiné après un saut de page si le tableau y déborde. */
function drawTable(w: Writer, columns: Column[], rows: string[][]) {
  const header = () =>
    tableRow(
      w,
      columns,
      columns.map(column => column.header),
      { bold: true }
    );
  ensureSpace(w, LINE_HEIGHT * 2);
  header();
  for (const row of rows) {
    if (w.y - LINE_HEIGHT < BOTTOM_MARGIN) {
      newPage(w);
      header();
    }
    tableRow(w, columns, row);
  }
}

const fmt = (value: number, currency: string) => money(value, currency);

function formatDate(value: Date, language: Language): string {
  const dd = String(value.getUTCDate()).padStart(2, '0');
  const mm = String(value.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = value.getUTCFullYear();
  return language === 'en' ? `${mm}/${dd}/${yyyy}` : `${dd}/${mm}/${yyyy}`;
}

function drawSummary(w: Writer, data: NetWorthExportData) {
  const lang = w.language;
  sectionTitle(w, t('Valeur nette', undefined, lang));
  line(w, `${t('Date de calcul', undefined, lang)} : ${formatDate(data.asOf, lang)}`, { color: GREY });
  line(w, `${t('Total des actifs', undefined, lang)} : ${fmt(data.totalAssets, data.currency)}`);
  line(w, `${t('Total des dettes', undefined, lang)} : ${fmt(data.totalDebts, data.currency)}`);
  line(w, `${t('Valeur nette', undefined, lang)} : ${fmt(data.netWorth, data.currency)}`, {
    bold: true,
    size: 11,
    color: data.netWorth < 0 ? RED : undefined
  });
  if (data.lowReliabilityShare > 0) {
    line(w, t('{{part}} % de la valeur repose sur des valeurs peu fiables', { part: data.lowReliabilityShare }, lang), {
      color: GREY
    });
  }
  line(
    w,
    t(
      'Les valeurs en devise étrangère sont converties en {{currency}} au taux saisi sur chaque actif',
      {
        currency: data.currency
      },
      lang
    ),
    { color: GREY }
  );
}

function drawByClass(w: Writer, data: NetWorthExportData) {
  if (data.byClass.length === 0) return;
  sectionTitle(w, t('Répartition par classe', undefined, w.language));
  const columns: Column[] = [
    { header: t('Classe', undefined, w.language), width: 245 },
    { header: t('Nombre', undefined, w.language), width: 70, end: true },
    { header: `${t('Valeur', undefined, w.language)} (${data.currency})`, width: 130, end: true },
    { header: t('Part', undefined, w.language), width: CONTENT_WIDTH - 445, end: true }
  ];
  drawTable(
    w,
    columns,
    data.byClass.map(entry => [
      assetClassLabel(entry.assetClass, w.language),
      String(entry.count),
      fmt(entry.value, data.currency),
      `${entry.share} %`
    ])
  );
}

function truncationNote(w: Writer, shown: number, total: number) {
  line(w, t('{{shown}} lignes affichées sur {{total}} (plafond de l’export)', { shown, total }, w.language), {
    color: RED
  });
}

function drawAssets(w: Writer, data: NetWorthExportData) {
  const lang = w.language;
  sectionTitle(w, `${t('Actifs', undefined, lang)} (${data.totals.assets})`);
  if (data.assets.length === 0) {
    line(w, t('Aucun actif compté dans la valeur nette.', undefined, lang));
    return;
  }
  const columns: Column[] = [
    { header: t('Actif', undefined, lang), width: 150 },
    { header: t('Classe', undefined, lang), width: 110 },
    { header: t("Valeur d'origine", undefined, lang), width: 100, end: true },
    { header: `${t('Valeur', undefined, lang)} (${data.currency})`, width: 90, end: true },
    { header: t('Fiabilité', undefined, lang), width: CONTENT_WIDTH - 450 }
  ];
  drawTable(
    w,
    columns,
    data.assets.map(asset => [
      asset.name,
      assetClassLabel(asset.assetClass, lang),
      fmt(asset.originalValue, asset.currency),
      fmt(asset.valueXof, data.currency),
      reliabilityLabel(asset.reliability, lang)
    ])
  );
  if (data.truncated.assets) truncationNote(w, data.assets.length, data.totals.assets);
}

function drawDebts(w: Writer, data: NetWorthExportData) {
  const lang = w.language;
  sectionTitle(w, `${t('Dettes', undefined, lang)} (${data.totals.debts})`);
  if (data.debts.length === 0) {
    line(w, t('Aucune dette en cours.', undefined, lang));
    return;
  }
  const columns: Column[] = [
    { header: t('Prêteur', undefined, lang), width: 120 },
    { header: t('Actif adossé', undefined, lang), width: 120 },
    { header: t('Capital restant dû', undefined, lang), width: 110, end: true },
    { header: `${t('Valeur', undefined, lang)} (${data.currency})`, width: 90, end: true },
    { header: t('Fin du prêt', undefined, lang), width: CONTENT_WIDTH - 440, end: true }
  ];
  drawTable(
    w,
    columns,
    data.debts.map(debt => [
      debt.lender,
      debt.assetName ?? t('Dette personnelle', undefined, lang),
      fmt(debt.remainingCapital, debt.currency),
      debt.valueXof === null ? '-' : fmt(debt.valueXof, data.currency),
      formatDate(debt.endDate, lang)
    ])
  );
  if (data.debts.some(debt => debt.valueXof === null)) {
    line(w, t('Une dette sans taux de change n’est pas comptée dans le total', undefined, lang), { color: RED });
  }
  if (data.truncated.debts) truncationNote(w, data.debts.length, data.totals.debts);
}

function drawExcluded(w: Writer, data: NetWorthExportData) {
  if (data.excludedAssets.length === 0) return;
  const lang = w.language;
  sectionTitle(w, `${t('Actifs non comptés', undefined, lang)} (${data.totals.excludedAssets})`);
  const columns: Column[] = [
    { header: t('Actif', undefined, lang), width: 200 },
    { header: t('Classe', undefined, lang), width: 170 },
    { header: t('Raison', undefined, lang), width: CONTENT_WIDTH - 370 }
  ];
  drawTable(
    w,
    columns,
    data.excludedAssets.map(item => [
      item.name,
      assetClassLabel(item.assetClass, lang),
      exclusionReasonLabel(item.reason, lang)
    ])
  );
  if (data.truncated.excludedAssets) truncationNote(w, data.excludedAssets.length, data.totals.excludedAssets);
}

function drawHistory(w: Writer, data: NetWorthExportData) {
  if (data.history.length === 0) return;
  const lang = w.language;
  sectionTitle(w, t('Historique', undefined, lang));
  const columns: Column[] = [
    { header: t('Date', undefined, lang), width: 90 },
    { header: t('Total des actifs', undefined, lang), width: 140, end: true },
    { header: t('Total des dettes', undefined, lang), width: 140, end: true },
    { header: t('Valeur nette', undefined, lang), width: CONTENT_WIDTH - 370, end: true }
  ];
  drawTable(
    w,
    columns,
    data.history.map(point => [
      point.date,
      fmt(point.totalAssets, data.currency),
      fmt(point.totalDebts, data.currency),
      fmt(point.netWorth, data.currency)
    ])
  );
  line(
    w,
    t('Les dettes passées reprennent le capital restant dû actuel (aucun amortissement reconstitué)', undefined, lang),
    {
      color: GREY
    }
  );
}

function drawFooters(pdfDoc: PDFDocument, fonts: { regular: PDFFont }, language: Language) {
  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    const label = `${t('Page', undefined, language)} ${index + 1} / ${pages.length}`;
    const width = fonts.regular.widthOfTextAtSize(label, 7);
    page.drawText(label, { x: (PAGE_SIZE[0] - width) / 2, y: 24, size: 7, font: fonts.regular, color: GREY });
  });
}

/** Construit le PDF de la situation patrimoniale d'une agence, en mémoire. */
export async function buildNetWorthPdf(tenantId: string, data: NetWorthExportData): Promise<Buffer> {
  const language: Language = currentLanguage() === 'ar' ? 'fr' : currentLanguage();

  const pdfDoc = await PDFDocument.create();
  const branding = await resolveDocumentBranding(tenantId, null);
  const fonts = await fontsOf(pdfDoc);

  const firstPage = pdfDoc.addPage(PAGE_SIZE);
  const startY = await drawDocumentHeader(pdfDoc, firstPage, branding, {
    title: t('Situation patrimoniale', undefined, language)
  });
  const w: Writer = { pdfDoc, fonts, page: firstPage, y: startY, language };

  drawSummary(w, data);
  drawByClass(w, data);
  drawAssets(w, data);
  drawDebts(w, data);
  drawExcluded(w, data);
  drawHistory(w, data);
  drawFooters(pdfDoc, fonts, language);

  return Buffer.from(await pdfDoc.save());
}
