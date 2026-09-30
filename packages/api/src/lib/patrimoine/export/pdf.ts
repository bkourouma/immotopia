import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import { drawDocumentHeader, fontsOf, resolveDocumentBranding, truncate } from '../../documents/document-branding';
import { money } from '../../finance/statement-pdf';
import { currentLanguage, t, type Language } from '../../../i18n';
import { determineExportCurrency, type ExportProperty, type PatrimoineExportData } from './data';
import { documentStateLabel, documentTypeLabel, loanStatusLabel, workProgramStatusLabel } from './labels';

/**
 * PDF de synthèse de l'export patrimoine — lot P3.
 *
 * A4, multipage : l'en-tête de marque (`drawDocumentHeader`) n'est dessiné que
 * sur la première page (comme les relevés de compte, `statement-pdf.ts`),
 * chaque page suivante démarre directement le contenu, et un pied de page
 * « page n / N » est posé une fois tout le contenu écrit — le nombre total de
 * pages n'est connu qu'à ce moment-là.
 *
 * Langue : les polices standard de pdf-lib (`Helvetica`) encodent en WinAnsi,
 * qui ne couvre pas l'arabe (voir `lib/documents/pdf-text.ts`). Plutôt que de
 * produire un PDF à moitié illisible, ce document force le français dès que
 * la langue de la requête est l'arabe ; l'export Excel, lui, reste dans la
 * langue demandée (`workbook.ts`).
 */

const PAGE_SIZE: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const BOTTOM_MARGIN = 56;
const LINE_HEIGHT = 12;
const GREY = rgb(0.4, 0.4, 0.4);
const RED = rgb(0.6, 0.15, 0.15);

interface Writer {
  pdfDoc: PDFDocument;
  fonts: { regular: PDFFont; bold: PDFFont };
  page: PDFPage;
  y: number;
  language: Language;
  /**
   * Rejoué juste après chaque saut de page tant qu'un tableau est en cours de
   * dessin (posé par `drawPerformanceTable`, effacé à la fin) : sans lui, une
   * page suivante commence directement par des lignes de données, sans savoir
   * à quoi elles correspondent (voir la note de tête de fichier).
   */
  onPageBreak: (() => void) | null;
}

function newPage(w: Writer) {
  w.page = w.pdfDoc.addPage(PAGE_SIZE);
  w.y = PAGE_SIZE[1] - MARGIN;
  if (w.onPageBreak) w.onPageBreak();
}

function ensureSpace(w: Writer, needed: number) {
  if (w.y - needed < BOTTOM_MARGIN) newPage(w);
}

function line(
  w: Writer,
  text: string,
  opts: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb>; indent?: number } = {}
) {
  ensureSpace(w, LINE_HEIGHT);
  const font = opts.bold ? w.fonts.bold : w.fonts.regular;
  const size = opts.size ?? 9;
  const x = MARGIN + (opts.indent ?? 0);
  const maxWidth = PAGE_SIZE[0] - MARGIN - x;
  w.page.drawText(truncate(nfc(text || ' '), font, size, maxWidth), { x, y: w.y, size, font, color: opts.color });
  w.y -= LINE_HEIGHT;
}

function sectionTitle(w: Writer, text: string) {
  ensureSpace(w, LINE_HEIGHT * 2 + 8);
  w.y -= 8;
  line(w, text, { bold: true, size: 12 });
  w.y -= 2;
}

/** Une saisie au clavier Mac/Windows peut arriver décomposée (« o » + accent) : on recompose. */
const nfc = (text: string) => text.normalize('NFC');
const fmt = (value: number, currency: string) => money(value, currency);
const pct = (value: number | null) => (value === null ? '-' : `${value.toFixed(2)} %`);
const amountOrDash = (value: number | null, currency: string) => (value === null ? '-' : fmt(value, currency));
const dateOrDash = (value: Date | null, language: Language) => (value ? formatDate(value, language) : '-');

function formatDate(value: Date, language: Language): string {
  // Pas `toLocaleDateString` : on reste sur un format fixe jour/mois/année,
  // independant de l'environnement Node qui execute le serveur (voir
  // `statement-pdf.ts` pour la meme prudence sur les montants).
  const d = new Date(value);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return language === 'en' ? `${mm}/${dd}/${yyyy}` : `${dd}/${mm}/${yyyy}`;
}

/** Montant sans suffixe de devise — mêmes règles de formatage que `money()`, sans la devise. */
const plainAmount = (value: number) => money(value, '').trimEnd();

function drawConsolidatedOverview(w: Writer, data: PatrimoineExportData) {
  if (!data.overview) return;
  sectionTitle(w, t('Vue consolidée', undefined, w.language));
  const o = data.overview;
  const occupancyPct = `${Math.round(o.occupancyRate * 1000) / 10} %`;

  // Les totaux de `overview` n'ont pas de devise propre (simples sommes) : on
  // la déduit des données détaillées déjà collectées. Une seule devise ⇒ on
  // l'affiche ; aucune donnée ⇒ XOF par défaut ; plusieurs ⇒ montants bruts,
  // sans suffixe, avec une mention explicite.
  const currencyInfo = determineExportCurrency(data.properties);
  const amount = (value: number) =>
    currencyInfo.kind === 'multiple'
      ? plainAmount(value)
      : fmt(value, currencyInfo.kind === 'single' ? currencyInfo.currency : 'XOF');

  line(w, `${t('Biens au portefeuille', undefined, w.language)} : ${o.totalProperties}`);
  line(w, `${t("Taux d'occupation", undefined, w.language)} : ${occupancyPct}`);
  line(w, `${t('Valeur estimée totale', undefined, w.language)} : ${amount(o.totalEstimatedValue)}`);
  line(w, `${t('Encours de crédits', undefined, w.language)} : ${amount(o.totalLoanBalance)}`);
  line(w, `${t("Charges de l'année", undefined, w.language)} : ${amount(o.totalExpensesThisYear)}`);
  line(w, `${t('Loyers annuels', undefined, w.language)} : ${amount(o.totalAnnualRent)}`);
  if (currencyInfo.kind === 'multiple') {
    line(w, t('Montants en plusieurs devises, additionnés sans conversion', undefined, w.language), { color: GREY });
  }
}

/**
 * Tableau de performance : une ligne « référence — titre » sur toute la largeur,
 * puis une ligne de chiffres. Sur une seule ligne, un montant à neuf chiffres
 * (« 120 000 000,00 XOF ») ne tenait plus dans sa colonne et finissait tronqué.
 */
const PERF_COLUMNS = [
  { x: 0, width: 95 },
  { x: 95, width: 95 },
  { x: 190, width: 50 },
  { x: 240, width: 50 },
  { x: 290, width: 55 },
  { x: 345, width: 170 }
];

function drawPerformanceCells(w: Writer, cells: string[], opts: { bold?: boolean } = {}) {
  ensureSpace(w, LINE_HEIGHT);
  const font = opts.bold ? w.fonts.bold : w.fonts.regular;
  cells.forEach((cell, index) => {
    const col = PERF_COLUMNS[index];
    w.page.drawText(truncate(nfc(cell), font, 8, col.width - 4), {
      x: MARGIN + col.x,
      y: w.y,
      size: 8,
      font
    });
  });
  w.y -= LINE_HEIGHT;
}

function drawPerformanceTableHeader(w: Writer) {
  drawPerformanceCells(
    w,
    [
      t('Valeur', undefined, w.language),
      t('Loyer annuel', undefined, w.language),
      t('Brut', undefined, w.language),
      t('Net', undefined, w.language),
      t('Net-net', undefined, w.language),
      t('Plus-value latente', undefined, w.language)
    ],
    { bold: true }
  );
}

function drawPerformanceTable(w: Writer, properties: ExportProperty[]) {
  sectionTitle(w, t('Performance par bien', undefined, w.language));
  // Redessiné en tête de chaque nouvelle page tant que le tableau est en
  // cours de dessin : au-delà d'une cinquantaine de biens, sans ce hook, les
  // pages suivantes n'ont plus d'en-têtes de colonnes.
  w.onPageBreak = () => drawPerformanceTableHeader(w);
  drawPerformanceTableHeader(w);
  for (const property of properties) {
    const currency = property.valuations[0]?.currency ?? 'XOF';
    // Le nom et sa ligne de chiffres restent sur la même page.
    ensureSpace(w, LINE_HEIGHT * 2);
    line(w, `${property.internalReference} — ${property.title}`, { bold: true, size: 8 });
    drawPerformanceCells(w, [
      fmt(property.yield.currentValue, currency),
      fmt(property.yield.annualRent, currency),
      pct(property.yield.grossYield),
      pct(property.yield.netYield),
      pct(property.yield.netNetYield),
      amountOrDash(property.yield.latentCapitalGain, currency)
    ]);
  }
  w.onPageBreak = null;
}

function drawPropertyBlock(w: Writer, property: ExportProperty) {
  sectionTitle(w, `${property.internalReference} — ${property.title}`);
  line(w, `${t('Adresse', undefined, w.language)} : ${property.address}`, { color: GREY });

  const lastValuation = property.valuations[0];
  line(
    w,
    `${t('Dernière valorisation', undefined, w.language)} : ${
      lastValuation
        ? `${fmt(lastValuation.estimatedValue, lastValuation.currency)} (${dateOrDash(lastValuation.valuatedAt, w.language)})`
        : '-'
    }`
  );

  const activeLoans = property.loans.filter(loan => loan.status === 'ACTIVE');
  if (activeLoans.length === 0) {
    line(w, `${t('Emprunts actifs', undefined, w.language)} : ${t('Aucun', undefined, w.language)}`);
  } else {
    line(w, `${t('Emprunts actifs', undefined, w.language)} :`);
    for (const loan of activeLoans) {
      line(
        w,
        `${loan.lender} — ${fmt(loan.remainingCapital, loan.currency)} (${loanStatusLabel(loan.status, w.language)})`,
        { indent: 12 }
      );
    }
  }

  // Mêmes charges annuelles que le rendement du bien (`buildPropertyYieldInput`,
  // `lib/patrimoine/yield.ts`) — jamais recalculées ici, pour ne pas dupliquer
  // la règle des « 12 derniers mois glissants, hors dépenses capitalisées ».
  if (property.yield.annualExpenses === 0) {
    line(w, `${t('Dépenses (12 derniers mois)', undefined, w.language)} : ${t('Aucune', undefined, w.language)}`);
  } else {
    const currency = property.valuations[0]?.currency ?? 'XOF';
    line(
      w,
      `${t('Dépenses (12 derniers mois)', undefined, w.language)} : ${fmt(property.yield.annualExpenses, currency)}`
    );
  }

  const upcomingWork = property.workPrograms.filter(p => p.status === 'PLANNED' || p.status === 'IN_PROGRESS');
  if (upcomingWork.length === 0) {
    line(w, `${t('Travaux à venir', undefined, w.language)} : ${t('Aucun', undefined, w.language)}`);
  } else {
    line(w, `${t('Travaux à venir', undefined, w.language)} :`);
    for (const program of upcomingWork) {
      line(
        w,
        `${program.title} — ${workProgramStatusLabel(program.status, w.language)} (${dateOrDash(program.plannedDate, w.language)})`,
        { indent: 12 }
      );
    }
  }

  const flaggedDocuments = property.documents.filter(d => d.state === 'EXPIRED' || d.state === 'EXPIRING_SOON');
  if (flaggedDocuments.length === 0) {
    line(w, `${t('Documents expirés ou expirant', undefined, w.language)} : ${t('Aucun', undefined, w.language)}`);
  } else {
    line(w, `${t('Documents expirés ou expirant', undefined, w.language)} :`);
    for (const doc of flaggedDocuments) {
      line(
        w,
        `${documentTypeLabel(doc.type, w.language)} — ${doc.label} : ${documentStateLabel(doc.state, w.language)} (${dateOrDash(doc.expiresAt, w.language)})`,
        { indent: 12, color: doc.state === 'EXPIRED' ? RED : undefined }
      );
    }
  }

  // Depenses categorisees et documents complets restent dans le classeur
  // Excel (`workbook.ts`) : ce bloc PDF est volontairement un resume court,
  // pas la liste exhaustive.
}

function drawFooters(pdfDoc: PDFDocument, fonts: { regular: PDFFont }, language: Language) {
  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    const label = `${t('Page', undefined, language)} ${index + 1} / ${pages.length}`;
    const width = fonts.regular.widthOfTextAtSize(label, 7);
    page.drawText(label, {
      x: (PAGE_SIZE[0] - width) / 2,
      y: 24,
      size: 7,
      font: fonts.regular,
      color: GREY
    });
  });
}

/** Construit le PDF de synthèse pour l'agence entière, ou pour un seul bien. */
export async function buildPatrimoinePdf(tenantId: string, data: PatrimoineExportData): Promise<Buffer> {
  const language: Language = currentLanguage() === 'ar' ? 'fr' : currentLanguage();

  const pdfDoc = await PDFDocument.create();
  const branding = await resolveDocumentBranding(tenantId, null);
  const fonts = await fontsOf(pdfDoc);

  const title =
    data.scope === 'AGENCY' ? t('Export du patrimoine', undefined, language) : t('Export du bien', undefined, language);
  const subtitle =
    data.scope === 'PROPERTY' && data.properties[0]
      ? `${data.properties[0].internalReference} — ${data.properties[0].title}`
      : undefined;

  const firstPage = pdfDoc.addPage(PAGE_SIZE);
  const startY = await drawDocumentHeader(pdfDoc, firstPage, branding, { title, subtitle });

  const w: Writer = { pdfDoc, fonts, page: firstPage, y: startY, language, onPageBreak: null };

  if (data.scope === 'AGENCY') {
    drawConsolidatedOverview(w, data);
    if (data.properties.length > 0) drawPerformanceTable(w, data.properties);
    for (const property of data.properties) {
      drawPropertyBlock(w, property);
    }
    if (data.properties.length === 0) {
      sectionTitle(w, t('Biens', undefined, language));
      line(w, t('Aucun bien à exporter pour cette agence.', undefined, language));
    }
  } else {
    for (const property of data.properties) {
      drawPropertyBlock(w, property);
    }
  }

  drawFooters(pdfDoc, fonts, language);

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
