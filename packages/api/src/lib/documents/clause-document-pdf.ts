/**
 * Moteur de rendu d'un document « à clauses » (mandats, spec 044) : un MODÈLE
 * de document (tout le texte qui sera imprimé) puis son rendu `pdf-lib`. Même
 * découpage que `lib/finance/stock-bons-pdf.ts` : le modèle se teste sans PDF.
 *
 * Tout texte passe par `sanitizeForPdf` (via `wrapText` / `truncate`) : la
 * police Helvetica (WinAnsi) n'imprime pas l'arabe, un libellé saisi dans une
 * autre écriture sort remplacé, jamais en erreur.
 */

import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { currentLanguage, t } from '../../i18n';

import { drawDocumentHeader, fontsOf, truncate, type DocumentBranding } from './document-branding';
import { sanitizeForPdf } from './pdf-text';
import { arabicFaces, drawArabicFooters, drawArabicText, wrapArabicText } from './pdf-arabic';
import { A4, wrapText } from '../syndics/charge-receipt-pdf';

export interface ClauseRow {
  label: string;
  value: string;
}

export interface ClauseSection {
  title: string;
  /** Couples libellé / valeur (parties, bien, conditions). */
  rows?: ClauseRow[];
  /** Paragraphes de clauses. */
  paragraphs?: string[];
}

export interface ClauseDocumentModel {
  title: string;
  subtitle?: string;
  sections: ClauseSection[];
  /** Cases de signature en fin de document (rôle puis nom). */
  signatures: Array<{ role: string; name: string }>;
  /** Mention imprimée sous les signatures. */
  closing?: string;
}

const MARGIN = 40;
const LABEL_WIDTH = 150;
const BODY_SIZE = 10;
const LINE = 13.5;
const GREY = rgb(0.35, 0.35, 0.35);
const BOTTOM = 56;

/** `04/10/2026` — jour UTC. */
export function formatClauseDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** Montant sans décimale parasite, groupes de trois chiffres séparés par une espace simple. */
export function formatClauseMoney(value: number, currency: string): string {
  const rounded = Math.round(value * 100) / 100;
  const [integer, decimals] = Math.abs(rounded).toFixed(2).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '-' : ''}${grouped}${decimals === '00' ? '' : `,${decimals}`} ${currency}`;
}

interface Cursor {
  pdfDoc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
}

function newPage(cursor: Cursor): void {
  cursor.page = cursor.pdfDoc.addPage([A4.width, A4.height]);
  cursor.y = A4.height - MARGIN - 10;
}

function ensureSpace(cursor: Cursor, needed: number): void {
  if (cursor.y - needed < BOTTOM) newPage(cursor);
}

function drawLines(cursor: Cursor, lines: string[], x: number, font: PDFFont, size = BODY_SIZE): void {
  for (const line of lines) {
    ensureSpace(cursor, LINE);
    cursor.page.drawText(sanitizeForPdf(line), { x, y: cursor.y, size, font });
    cursor.y -= LINE;
  }
}

function drawSection(cursor: Cursor, section: ClauseSection): void {
  const contentWidth = A4.width - 2 * MARGIN;
  ensureSpace(cursor, 60);
  cursor.y -= 6;
  cursor.page.drawText(truncate(section.title, cursor.bold, 11, contentWidth), {
    x: MARGIN,
    y: cursor.y,
    size: 11,
    font: cursor.bold
  });
  cursor.y -= 5;
  cursor.page.drawLine({
    start: { x: MARGIN, y: cursor.y },
    end: { x: A4.width - MARGIN, y: cursor.y },
    thickness: 0.4,
    color: rgb(0.8, 0.8, 0.8)
  });
  cursor.y -= 14;
  for (const row of section.rows ?? []) {
    const valueLines = wrapText(row.value || '-', cursor.regular, BODY_SIZE, contentWidth - LABEL_WIDTH, 12);
    ensureSpace(cursor, LINE);
    cursor.page.drawText(truncate(row.label, cursor.bold, 9, LABEL_WIDTH - 8), {
      x: MARGIN,
      y: cursor.y,
      size: 9,
      font: cursor.bold,
      color: GREY
    });
    drawLines(cursor, valueLines, MARGIN + LABEL_WIDTH, cursor.regular);
  }
  for (const paragraph of section.paragraphs ?? []) {
    drawLines(cursor, wrapText(paragraph, cursor.regular, BODY_SIZE, contentWidth), MARGIN, cursor.regular);
    cursor.y -= 4;
  }
}

function drawSignatures(cursor: Cursor, model: ClauseDocumentModel): void {
  if (model.signatures.length === 0) return;
  const boxWidth = (A4.width - 2 * MARGIN - 20) / 2;
  ensureSpace(cursor, 110);
  cursor.y -= 10;
  cursor.page.drawText('Signatures', { x: MARGIN, y: cursor.y, size: 11, font: cursor.bold });
  cursor.y -= 16;
  for (let index = 0; index < model.signatures.length; index += 2) {
    ensureSpace(cursor, 90);
    const rowTop = cursor.y;
    model.signatures.slice(index, index + 2).forEach((signature, column) => {
      const x = MARGIN + column * (boxWidth + 20);
      cursor.page.drawRectangle({
        x,
        y: rowTop - 70,
        width: boxWidth,
        height: 76,
        borderColor: rgb(0.75, 0.75, 0.75),
        borderWidth: 0.6
      });
      cursor.page.drawText(truncate(signature.role, cursor.bold, 9, boxWidth - 12), {
        x: x + 6,
        y: rowTop - 8,
        size: 9,
        font: cursor.bold
      });
      cursor.page.drawText(truncate(signature.name || ' ', cursor.regular, 9, boxWidth - 12), {
        x: x + 6,
        y: rowTop - 20,
        size: 9,
        font: cursor.regular,
        color: GREY
      });
    });
    cursor.y = rowTop - 86;
  }
  if (model.closing) {
    drawLines(cursor, wrapText(model.closing, cursor.regular, 8, A4.width - 2 * MARGIN), MARGIN, cursor.regular, 8);
  }
}

/** Numérote les pages (« Page 1 / 3 ») une fois leur nombre connu. */
function drawFooters(pdfDoc: PDFDocument, font: PDFFont, label: string): void {
  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    const text = sanitizeForPdf(`${label} - Page ${index + 1} / ${pages.length}`);
    page.drawText(text, { x: MARGIN, y: 30, size: 8, font, color: GREY });
  });
}

/** Rendu Unicode RTL ; les clauses sont localisées par les builders du modèle. */
async function renderArabicClauseDocumentPdf(model: ClauseDocumentModel, branding: DocumentBranding): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setLanguage('ar');
  pdfDoc.setTitle(model.title);
  const faces = await arabicFaces(pdfDoc);
  let page = pdfDoc.addPage([A4.width, A4.height]);
  let y = await drawDocumentHeader(pdfDoc, page, branding, { title: model.title, subtitle: model.subtitle });
  const right = A4.width - MARGIN;
  const width = A4.width - 2 * MARGIN;
  const ensure = (height: number) => {
    if (y - height >= BOTTOM) return;
    page = pdfDoc.addPage([A4.width, A4.height]);
    y = A4.height - MARGIN - 10;
  };
  const linesOf = (text: string, size: number, maxWidth: number) =>
    wrapArabicText(faces.regular, text || '—', size, maxWidth);
  const drawParagraph = (text: string, size = BODY_SIZE) => {
    for (const line of linesOf(text, size, width)) {
      ensure(LINE);
      drawArabicText(page, faces.regular, line, { x: right, y, size, maxWidth: width });
      y -= LINE;
    }
    y -= 4;
  };

  for (const section of model.sections) {
    ensure(60);
    y -= 6;
    drawArabicText(page, faces.bold, section.title, { x: right, y, size: 11, maxWidth: width });
    y -= 5;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 0.4, color: rgb(0.8, 0.8, 0.8) });
    y -= 14;
    for (const row of section.rows ?? []) {
      const numeric = /^[\d\s,./+\-]+(?:XOF|FCFA|EUR|USD)?$/.test(row.value.trim());
      const valueLines = linesOf(row.value || '—', BODY_SIZE, width - LABEL_WIDTH);
      for (const [index, line] of valueLines.entries()) {
        ensure(LINE);
        if (index === 0)
          drawArabicText(page, faces.bold, row.label, {
            x: right,
            y,
            size: 9,
            maxWidth: LABEL_WIDTH - 8,
            color: GREY
          });
        drawArabicText(page, faces.regular, line, {
          x: numeric ? MARGIN : right - LABEL_WIDTH,
          y,
          size: BODY_SIZE,
          maxWidth: width - LABEL_WIDTH,
          ...(numeric ? { align: 'start' as const } : {})
        });
        y -= LINE;
      }
    }
    for (const paragraph of section.paragraphs ?? []) drawParagraph(paragraph);
  }

  if (model.signatures.length > 0) {
    ensure(110);
    y -= 10;
    drawArabicText(page, faces.bold, t('Signatures', undefined, 'ar'), { x: right, y, size: 11, maxWidth: width });
    y -= 16;
    const boxWidth = (width - 20) / 2;
    for (let index = 0; index < model.signatures.length; index += 2) {
      ensure(90);
      const rowTop = y;
      model.signatures.slice(index, index + 2).forEach((signature, column) => {
        const x = column === 0 ? right - boxWidth : MARGIN;
        page.drawRectangle({
          x,
          y: rowTop - 70,
          width: boxWidth,
          height: 76,
          borderColor: rgb(0.75, 0.75, 0.75),
          borderWidth: 0.6
        });
        drawArabicText(page, faces.bold, signature.role, {
          x: x + boxWidth - 6,
          y: rowTop - 8,
          size: 9,
          maxWidth: boxWidth - 12
        });
        drawArabicText(page, faces.regular, signature.name || ' ', {
          x: x + boxWidth - 6,
          y: rowTop - 20,
          size: 9,
          maxWidth: boxWidth - 12,
          color: GREY
        });
      });
      y = rowTop - 86;
    }
  }
  if (model.closing) drawParagraph(model.closing, 8);
  drawArabicFooters(pdfDoc, faces, branding.issuer.name);
  return Buffer.from(await pdfDoc.save());
}

/** Rend un modèle de document en PDF A4. */
export async function renderClauseDocumentPdf(model: ClauseDocumentModel, branding: DocumentBranding): Promise<Buffer> {
  if (currentLanguage() === 'ar') return renderArabicClauseDocumentPdf(model, branding);
  const pdfDoc = await PDFDocument.create();
  const { regular, bold } = await fontsOf(pdfDoc);
  const page = pdfDoc.addPage([A4.width, A4.height]);
  const cursor: Cursor = { pdfDoc, page, y: 0, regular, bold };
  cursor.y = await drawDocumentHeader(pdfDoc, page, branding, { title: model.title, subtitle: model.subtitle });
  for (const section of model.sections) drawSection(cursor, section);
  drawSignatures(cursor, model);
  drawFooters(pdfDoc, regular, model.title);
  pdfDoc.setTitle(sanitizeForPdf(model.title));
  return Buffer.from(await pdfDoc.save());
}
