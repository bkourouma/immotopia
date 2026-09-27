import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb, type RGB } from 'pdf-lib';
import {
  embedImage,
  fitInBox,
  fontsOf,
  issuerIdentityLines,
  truncate,
  type DocumentBranding,
  type DocumentImage
} from '../documents/document-branding';
import { sanitizeForPdf } from '../documents/pdf-text';
import { amountToFrenchWords } from './number-to-french-words';
import { frenchDay, paymentMethodLabel, periodText, type ChargeReceiptSnapshot } from './charge-receipt-snapshot';

/**
 * Rendu PDF des reçus et quittances de charges (lot S3).
 *
 * UNE fonction, `drawChargeReceipt`, dessine un document dans un rectangle
 * quelconque : une page A4 entière pour le document unitaire, une case d'une
 * grille colonnes × lignes pour l'impression groupée. Les tailles de police
 * et d'image suivent la taille de la case (échelle rapportée à la zone utile
 * d'une page A4), avec des minimums lisibles ; ce qui ne tient plus dans une
 * petite case (lignes d'identité secondaires, détail des affectations) est
 * abrégé plutôt que de déborder. Toutes les données viennent du `snapshot`.
 */

export const A4 = { width: 595.28, height: 841.89 };
const PAGE_MARGIN = 40;
/** Zone utile de référence (échelle 1) : une page A4 moins ses marges. */
const REFERENCE = { width: A4.width - 2 * PAGE_MARGIN, height: A4.height - 2 * PAGE_MARGIN };

const GREY = rgb(0.35, 0.35, 0.35);
const LIGHT = rgb(0.75, 0.75, 0.75);
const BLACK = rgb(0, 0, 0);

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------- formats

/** Montant avec séparateur de milliers (espace simple, encodable en WinAnsi). */
export function formatAmount(amount: number, currency: string): string {
  const cents = Math.round(amount * 100);
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const integer = Math.floor(absolute / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const decimals = absolute % 100;
  const text = decimals ? `${integer},${String(decimals).padStart(2, '0')}` : integer;
  return `${negative ? '-' : ''}${text} ${currency}`;
}

function titleOf(snapshot: ChargeReceiptSnapshot): string {
  return snapshot.kind === 'QUITTANCE' ? 'QUITTANCE DE CHARGES' : 'REÇU DE PAIEMENT';
}

/** Coupe un texte en lignes qui tiennent dans `maxWidth` (au plus `maxLines`, la dernière abrégée). */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = 99): string[] {
  const words = sanitizeForPdf(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  const fitted = lines.map(line => truncate(line, font, size, maxWidth));
  if (fitted.length <= maxLines) return fitted;
  const kept = fitted.slice(0, maxLines);
  kept[maxLines - 1] = truncate(`${lines.slice(maxLines - 1).join(' ')}`, font, size, maxWidth);
  return kept;
}

// ---------------------------------------------------------------- images

const imageCache = new WeakMap<PDFDocument, Map<DocumentImage, Promise<PDFImage | null>>>();

/** Intègre une image une seule fois par document PDF (impression groupée : une image, N cases). */
function embedOnce(pdfDoc: PDFDocument, image: DocumentImage | null): Promise<PDFImage | null> {
  if (!image) return Promise.resolve(null);
  let cache = imageCache.get(pdfDoc);
  if (!cache) {
    cache = new Map();
    imageCache.set(pdfDoc, cache);
  }
  let embedded = cache.get(image);
  if (!embedded) {
    embedded = embedImage(pdfDoc, image);
    cache.set(image, embedded);
  }
  return embedded;
}

// ---------------------------------------------------------------- flux

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Curseur vertical dans une case : écrit tant qu'il reste de la place au-dessus de `bottom`. */
class Flow {
  constructor(
    private readonly page: PDFPage,
    readonly x: number,
    readonly width: number,
    public y: number,
    readonly bottom: number
  ) {}

  fits(height: number): boolean {
    return this.y - height >= this.bottom;
  }

  line(text: string, font: PDFFont, size: number, options: { color?: RGB; x?: number; width?: number } = {}) {
    const lineHeight = size * 1.3;
    if (!this.fits(lineHeight)) return false;
    const x = options.x ?? this.x;
    const width = options.width ?? this.width - (x - this.x);
    this.page.drawText(truncate(text || ' ', font, size, width), {
      x,
      y: this.y - size,
      size,
      font,
      color: options.color ?? BLACK
    });
    this.y -= lineHeight;
    return true;
  }

  gap(height: number) {
    this.y -= height;
  }
}

// ---------------------------------------------------------------- dessin

/** Échelle d'une case par rapport à la zone utile d'une page A4, bornée. */
export function scaleForBox(box: Pick<Box, 'width' | 'height'>): number {
  return Math.max(0.2, Math.min(1, box.width / REFERENCE.width, box.height / REFERENCE.height));
}

async function drawHeader(
  pdfDoc: PDFDocument,
  page: PDFPage,
  box: Box,
  branding: DocumentBranding,
  flow: Flow,
  s: number,
  fonts: Fonts
) {
  const logoBox = { width: Math.max(28, 90 * s), height: Math.max(20, 60 * s) };
  const top = flow.y;
  let bandBottom = top;
  let textX = box.x;
  let textRight = box.x + box.width;

  const issuerLogo = await embedOnce(pdfDoc, branding.issuerLogo);
  if (issuerLogo) {
    const size = fitInBox(issuerLogo.width, issuerLogo.height, logoBox.width, logoBox.height);
    page.drawImage(issuerLogo, { x: box.x, y: top - size.height, ...size });
    textX = box.x + logoBox.width + 8 * Math.max(s, 0.5);
    bandBottom = Math.min(bandBottom, top - size.height);
  }
  const syndicateLogo = await embedOnce(pdfDoc, branding.syndicate?.logo ?? null);
  if (syndicateLogo) {
    const size = fitInBox(syndicateLogo.width, syndicateLogo.height, logoBox.width, logoBox.height);
    page.drawImage(syndicateLogo, { x: box.x + box.width - size.width, y: top - size.height, ...size });
    textRight = box.x + box.width - logoBox.width - 8 * Math.max(s, 0.5);
    bandBottom = Math.min(bandBottom, top - size.height);
  }

  const identity = new Flow(page, textX, Math.max(textRight - textX, 40), top, box.y);
  identity.line(branding.issuer.name, fonts.bold, Math.max(7, 12 * s));
  // Petite case : seules les deux premières lignes d'identité (adresse, contact).
  const lines = issuerIdentityLines(branding.issuer).slice(0, s < 0.45 ? 2 : 4);
  for (const line of lines) identity.line(line, fonts.regular, Math.max(5, 8 * s), { color: GREY });
  bandBottom = Math.min(bandBottom, identity.y);

  flow.y = bandBottom - Math.max(3, 8 * s);
  page.drawLine({
    start: { x: box.x, y: flow.y },
    end: { x: box.x + box.width, y: flow.y },
    thickness: 0.5,
    color: LIGHT
  });
  flow.gap(Math.max(4, 12 * s));
}

function drawTitle(page: PDFPage, snapshot: ChargeReceiptSnapshot, flow: Flow, s: number, fonts: Fonts) {
  const titleSize = Math.max(8, 16 * s);
  const numberSize = Math.max(6.5, 10 * s);
  const numberText = sanitizeForPdf(`N° ${snapshot.number}`);
  const numberWidth = fonts.bold.widthOfTextAtSize(numberText, numberSize);
  page.drawText(numberText, {
    x: flow.x + flow.width - numberWidth,
    y: flow.y - titleSize,
    size: numberSize,
    font: fonts.bold
  });
  flow.line(titleOf(snapshot), fonts.bold, titleSize, { width: flow.width - numberWidth - 6 });
  flow.line(`Émis le ${frenchDay(snapshot.issuedAt)}`, fonts.regular, Math.max(5.5, 8 * s), { color: GREY });
  flow.gap(Math.max(2, 8 * s));
}

function drawInfoRows(snapshot: ChargeReceiptSnapshot, flow: Flow, s: number, fonts: Fonts) {
  const size = Math.max(6, 9.5 * s);
  const labelWidth = Math.max(48, 105 * s);
  const row = (label: string, value: string | null | undefined) => {
    if (!value) return;
    if (!flow.fits(size * 1.3)) return;
    const y = flow.y;
    flow.line(label, fonts.bold, size, { width: labelWidth - 4 });
    flow.y = y;
    flow.line(value, fonts.regular, size, { x: flow.x + labelWidth });
  };
  const syndicate = snapshot.syndicate;
  row('Copropriété', [syndicate.name, syndicate.address].filter(Boolean).join(' - '));
  const refs = [
    syndicate.registrationNo ? `Immatriculation ${syndicate.registrationNo}` : null,
    syndicate.cadastralReference ? `Réf. cadastrale ${syndicate.cadastralReference}` : null
  ]
    .filter(Boolean)
    .join(' - ');
  row('Références', refs);
  const lot = snapshot.lot;
  row('Lot', [`${lot.number}${lot.type ? ` (${lot.type})` : ''}`, lot.label].filter(Boolean).join(' - '));
  row('Copropriétaire', snapshot.coowner?.name ?? 'Non renseigné');
  if (s >= 0.45) row('Adresse', snapshot.coowner?.address);
  if (snapshot.kind === 'QUITTANCE') row('Période', periodText(snapshot.call?.period));
  flow.gap(Math.max(2, 8 * s));
}

function drawAmount(page: PDFPage, snapshot: ChargeReceiptSnapshot, flow: Flow, s: number, fonts: Fonts) {
  const amountSize = Math.max(7.5, 13 * s);
  const wordsSize = Math.max(6, 9.5 * s);
  const padding = Math.max(3, 8 * s);
  const words = wrapText(
    `Soit : ${amountToFrenchWords(snapshot.amount, snapshot.currency)}`,
    fonts.regular,
    wordsSize,
    flow.width - 2 * padding,
    s < 0.45 ? 2 : 3
  );
  const height = 2 * padding + amountSize * 1.3 + words.length * wordsSize * 1.3;
  if (!flow.fits(height)) return;
  page.drawRectangle({
    x: flow.x,
    y: flow.y - height,
    width: flow.width,
    height,
    borderColor: LIGHT,
    borderWidth: 0.75,
    color: rgb(0.97, 0.97, 0.97)
  });
  const inner = new Flow(page, flow.x + padding, flow.width - 2 * padding, flow.y - padding, flow.y - height);
  const label = snapshot.kind === 'QUITTANCE' ? 'Montant acquitté : ' : 'Montant reçu : ';
  inner.line(`${label}${formatAmount(snapshot.amount, snapshot.currency)}`, fonts.bold, amountSize);
  for (const line of words) inner.line(line, fonts.regular, wordsSize);
  flow.y -= height + Math.max(3, 8 * s);
}

function settlementText(item: { paidAt: string; method: string | null; reference: string | null; source: string }) {
  if (item.source === 'ADVANCE') return `Avance du ${frenchDay(item.paidAt)} imputée`;
  return [
    `Le ${frenchDay(item.paidAt)}`,
    paymentMethodLabel(item.method),
    item.reference ? `réf. ${item.reference}` : null
  ]
    .filter(Boolean)
    .join(' - ');
}

/** Lignes « à gauche / à droite » (libellé, montant), abrégées si la place manque. */
function drawLedger(
  page: PDFPage,
  rows: Array<{ left: string; right: string }>,
  flow: Flow,
  size: number,
  fonts: Fonts,
  reserveAfter: number
) {
  const lineHeight = size * 1.3;
  for (let index = 0; index < rows.length; index += 1) {
    const remaining = rows.length - index;
    // Dernière ligne disponible et il en reste plusieurs : « … et N autres ».
    if (remaining > 1 && !flow.fits(2 * lineHeight + reserveAfter)) {
      flow.line(`... et ${remaining} autres lignes`, fonts.regular, size, { color: GREY });
      return;
    }
    if (!flow.fits(lineHeight + reserveAfter)) return;
    const right = sanitizeForPdf(rows[index].right);
    const rightWidth = fonts.regular.widthOfTextAtSize(right, size);
    page.drawText(right, { x: flow.x + flow.width - rightWidth, y: flow.y - size, size, font: fonts.regular });
    flow.line(rows[index].left, fonts.regular, size, { width: flow.width - rightWidth - 8 });
  }
}

/**
 * Règlements (quittance) ou paiement et affectation (reçu). Priorité à
 * l'essentiel quand la case est petite : le résumé passe avant le détail,
 * abrégé en « ... et N autres lignes » ou en une seule ligne.
 */
function drawPaymentDetails(page: PDFPage, snapshot: ChargeReceiptSnapshot, flow: Flow, s: number, fonts: Fonts) {
  const size = Math.max(6, 9 * s);
  const lineHeight = size * 1.3;
  const currency = snapshot.currency;

  if (snapshot.kind === 'QUITTANCE') {
    const count = snapshot.settlements.length;
    if (count > 0 && flow.fits(2 * lineHeight)) {
      flow.line(count > 1 ? 'Règlements' : 'Règlement', fonts.bold, size);
      drawLedger(
        page,
        snapshot.settlements.map(item => ({ left: settlementText(item), right: formatAmount(item.amount, currency) })),
        flow,
        size,
        fonts,
        0
      );
    } else if (snapshot.settledAt) {
      flow.line(
        `Réglé le ${frenchDay(snapshot.settledAt)} (${count} règlement${count > 1 ? 's' : ''})`,
        fonts.regular,
        size
      );
    }
    return;
  }

  const payment = snapshot.payment;
  if (payment) {
    flow.line(
      settlementText({
        paidAt: payment.paidAt,
        method: payment.method,
        reference: payment.reference,
        source: 'PAYMENT'
      }),
      fonts.regular,
      size
    );
  }
  const summarySize = Math.max(6, 9.5 * s);
  const outstanding = formatAmount(snapshot.outstandingAfter, currency);
  const advance = formatAmount(snapshot.advance, currency);
  if (s < 0.45) {
    // Petite case : reste dû et avance sur une seule ligne.
    flow.line(`Reste dû : ${outstanding} - Avance : ${advance}`, fonts.bold, summarySize);
  } else {
    flow.line(`Reste dû sur les appels réglés : ${outstanding}`, fonts.bold, summarySize);
    flow.line(`Avance conservée : ${advance}`, fonts.bold, summarySize);
  }
  flow.gap(Math.max(1, 3 * s));
  if (snapshot.allocations.length === 0) {
    flow.line('Aucun appel en attente : le paiement est conservé en avance.', fonts.regular, size, { color: GREY });
    return;
  }
  if (!flow.fits(2 * lineHeight)) return;
  flow.line('Affectation', fonts.bold, size);
  drawLedger(
    page,
    snapshot.allocations.map(item => ({
      left: `${periodText(item.period) || 'Appel'}${item.source === 'ADVANCE' ? ' (avance)' : ''} - reste dû ${formatAmount(item.outstandingAfter, currency)}`,
      right: formatAmount(item.allocated, currency)
    })),
    flow,
    size,
    fonts,
    0
  );
}

function mentionText(snapshot: ChargeReceiptSnapshot): string {
  if (snapshot.kind === 'QUITTANCE') {
    return 'Pour acquit de la somme ci-dessus, au titre des charges de copropriété de la période indiquée.';
  }
  return 'Reçu la somme ci-dessus. Ce reçu ne vaut pas quittance des sommes restant dues.';
}

async function drawSignature(
  pdfDoc: PDFDocument,
  page: PDFPage,
  box: Box,
  branding: DocumentBranding,
  snapshot: ChargeReceiptSnapshot,
  height: number,
  s: number,
  fonts: Fonts
) {
  const size = Math.max(6, 9 * s);
  const small = Math.max(5, 8 * s);
  const top = box.y + height;
  const columnWidth = Math.min(box.width / 2, Math.max(90, 200 * s));
  const x = box.x + box.width - columnWidth;

  page.drawText(
    truncate(`Fait le ${frenchDay(snapshot.issuedAt)}`, fonts.regular, small, box.width - columnWidth - 6),
    {
      x: box.x,
      y: top - size,
      size: small,
      font: fonts.regular,
      color: GREY
    }
  );
  page.drawText(truncate('Pour acquit', fonts.bold, size, columnWidth), { x, y: top - size, size, font: fonts.bold });

  const areaTop = top - size * 1.5;
  const areaHeight = Math.max(8, height - size * 1.5 - small * 1.6);
  const stamp = await embedOnce(pdfDoc, branding.stamp);
  if (stamp) {
    const fitted = fitInBox(stamp.width, stamp.height, columnWidth * 0.5, areaHeight);
    page.drawImage(stamp, { x, y: areaTop - fitted.height, ...fitted, opacity: 0.9 });
  }
  const signature = await embedOnce(pdfDoc, branding.signature);
  if (signature) {
    const fitted = fitInBox(signature.width, signature.height, columnWidth * 0.7, areaHeight * 0.8);
    page.drawImage(signature, {
      x: x + columnWidth * 0.15,
      y: areaTop - (areaHeight + fitted.height) / 2,
      ...fitted
    });
  }
  page.drawText(truncate(branding.issuer.name || ' ', fonts.regular, small, columnWidth), {
    x,
    y: box.y + 1,
    size: small,
    font: fonts.regular,
    color: GREY
  });
}

/**
 * Dessine un reçu ou une quittance dans `box` (coordonnées PDF, origine en
 * bas à gauche). `branding` porte l'identité à afficher (celle du snapshot)
 * et les images de l'émetteur.
 */
export async function drawChargeReceipt(
  pdfDoc: PDFDocument,
  page: PDFPage,
  box: Box,
  data: ChargeReceiptSnapshot,
  branding: DocumentBranding
): Promise<void> {
  const fonts = await fontsOf(pdfDoc);
  const s = scaleForBox(box);
  const signatureHeight = Math.max(34, 120 * s);
  const mentionSize = Math.max(5.5, 8.5 * s);
  const mention = wrapText(mentionText(data), fonts.regular, mentionSize, box.width, 2);
  const mentionHeight = mention.length * mentionSize * 1.3 + Math.max(2, 6 * s);
  const bottom = box.y + signatureHeight + mentionHeight;

  const flow = new Flow(page, box.x, box.width, box.y + box.height, bottom);
  await drawHeader(pdfDoc, page, box, branding, flow, s, fonts);
  drawTitle(page, data, flow, s, fonts);
  drawInfoRows(data, flow, s, fonts);
  drawAmount(page, data, flow, s, fonts);
  drawPaymentDetails(page, data, flow, s, fonts);
  if (data.backfilled) {
    flow.line('Quittance établie a posteriori (rattrapage).', fonts.regular, Math.max(5, 7.5 * s), { color: GREY });
  }

  // Mention et signature suivent le contenu (sans descendre sous la place réservée).
  const mentionTop = Math.max(bottom, flow.y - Math.max(4, 14 * s));
  const signatureBottom = mentionTop - mentionHeight - signatureHeight;
  const mentionFlow = new Flow(page, box.x, box.width, mentionTop, signatureBottom + signatureHeight);
  for (const line of mention) mentionFlow.line(line, fonts.regular, mentionSize, { color: GREY });
  const signatureBox = { ...box, y: signatureBottom, height: signatureHeight };
  await drawSignature(pdfDoc, page, signatureBox, branding, data, signatureHeight, s, fonts);
}

// ---------------------------------------------------------------- documents

export interface RenderItem {
  snapshot: ChargeReceiptSnapshot;
  branding: DocumentBranding;
}

function stampMetadata(pdfDoc: PDFDocument, title: string, author: string, at: Date) {
  // Dates figées : un PDF reconstruit depuis le snapshot est identique à l'original.
  pdfDoc.setTitle(sanitizeForPdf(title));
  pdfDoc.setAuthor(sanitizeForPdf(author));
  pdfDoc.setProducer('ImmoTopia');
  pdfDoc.setCreator('ImmoTopia');
  pdfDoc.setCreationDate(at);
  pdfDoc.setModificationDate(at);
}

/** Document unitaire : une case pleine page A4. */
export async function renderChargeReceiptPdf(item: RenderItem): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([A4.width, A4.height]);
  await drawChargeReceipt(
    pdfDoc,
    page,
    { x: PAGE_MARGIN, y: PAGE_MARGIN, width: REFERENCE.width, height: REFERENCE.height },
    item.snapshot,
    item.branding
  );
  stampMetadata(
    pdfDoc,
    `${titleOf(item.snapshot)} ${item.snapshot.number}`,
    item.snapshot.issuer.name,
    new Date(item.snapshot.issuedAt)
  );
  return Buffer.from(await pdfDoc.save());
}

export const GRID_LIMITS = { minCols: 1, maxCols: 3, minRows: 1, maxRows: 4 } as const;
const SHEET_MARGIN = 18;
const CELL_PADDING = 10;

/** Cases d'une feuille A4 découpée en `cols` × `rows`, de gauche à droite puis de haut en bas. */
export function gridCells(cols: number, rows: number): Box[] {
  const cellWidth = (A4.width - 2 * SHEET_MARGIN) / cols;
  const cellHeight = (A4.height - 2 * SHEET_MARGIN) / rows;
  const cells: Box[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({
        x: SHEET_MARGIN + col * cellWidth + CELL_PADDING,
        y: A4.height - SHEET_MARGIN - (row + 1) * cellHeight + CELL_PADDING,
        width: cellWidth - 2 * CELL_PADDING,
        height: cellHeight - 2 * CELL_PADDING
      });
    }
  }
  return cells;
}

/** Traits de coupe fins et pointillés entre les cases. */
function drawCutLines(page: PDFPage, cols: number, rows: number) {
  const cellWidth = (A4.width - 2 * SHEET_MARGIN) / cols;
  const cellHeight = (A4.height - 2 * SHEET_MARGIN) / rows;
  const style = { thickness: 0.3, color: LIGHT, dashArray: [3, 3] };
  for (let col = 1; col < cols; col += 1) {
    const x = SHEET_MARGIN + col * cellWidth;
    page.drawLine({ start: { x, y: SHEET_MARGIN / 2 }, end: { x, y: A4.height - SHEET_MARGIN / 2 }, ...style });
  }
  for (let row = 1; row < rows; row += 1) {
    const y = A4.height - SHEET_MARGIN - row * cellHeight;
    page.drawLine({ start: { x: SHEET_MARGIN / 2, y }, end: { x: A4.width - SHEET_MARGIN / 2, y }, ...style });
  }
}

/** Nombre de feuilles pour `count` documents en `cols` × `rows`. */
export function sheetCount(count: number, cols: number, rows: number): number {
  return Math.ceil(count / (cols * rows));
}

/** Impression groupée : `cols` × `rows` documents par feuille A4, dans l'ordre donné. */
export async function renderChargeReceiptSheets(items: RenderItem[], cols: number, rows: number): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const cells = gridCells(cols, rows);
  const perPage = cols * rows;
  for (let start = 0; start < items.length; start += perPage) {
    const page = pdfDoc.addPage([A4.width, A4.height]);
    const chunk = items.slice(start, start + perPage);
    for (let index = 0; index < chunk.length; index += 1) {
      await drawChargeReceipt(pdfDoc, page, cells[index], chunk[index].snapshot, chunk[index].branding);
    }
    if (perPage > 1) drawCutLines(page, cols, rows);
  }
  stampMetadata(pdfDoc, 'Impression des quittances', items[0]?.snapshot.issuer.name ?? '', new Date());
  return Buffer.from(await pdfDoc.save());
}
