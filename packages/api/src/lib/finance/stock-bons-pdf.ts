/**
 * Bons du stock : lecture et PDF — lot 040, territoire API-4 (spec B4 ;
 * data-model §2.6 ; contrat `SlipView`).
 *
 * Trois natures : bon de réception (BR), bon de sortie (BS), procès-verbal
 * d'inventaire (PVI). Le bon naît dans la transaction de l'opération
 * (`createStockSlipTx`, `stock-bons.ts`) ; ici, on le RELIT et on le
 * RÉIMPRIME. Rien n'est stocké : le PDF se régénère à chaque demande, avec la
 * mention « Exemplaire réimprimé le … » (B4-R3).
 *
 * Règles d'impression :
 *
 * - **Libellés figés** (B4-R3) : article, lieu, chantier, preneur ou
 *   demandeur, facture et fournisseur, auteur, compteurs et validateur sont
 *   lus dans `StockSlip.snapshot`, jamais relus en base : renommer un article
 *   ne change pas un bon déjà émis. Seul l'en-tête de l'agence est relu
 *   (`document-branding.ts`), puisqu'il identifie l'émetteur.
 * - **Montants** : seulement pour un appelant qui détient STOCK_VALUES_VIEW
 *   (B1-R5, spec §8.1). Sans ce droit, aucune colonne ni aucun total de
 *   valeur n'est imprimé.
 * - **Aveugle** (spec §8.2) : aucune quantité après mouvement n'est imprimée
 *   sur un bon, jamais ; et le prix d'un mouvement d'un lieu en comptage est
 *   masqué pour un appelant sans STOCK_COUNT_VALIDATE (`maskMovementView`).
 * - **Français** : pièce comptable. Tout texte passe par `sanitizeForPdf`
 *   (via `truncate` de `document-branding.ts`) : la police Helvetica (WinAnsi)
 *   n'imprime pas l'arabe ; un libellé saisi en arabe sort remplacé, jamais en
 *   erreur.
 * - **PVI d'avant le lot** (B4-R3 bis) : un inventaire validé sans bon
 *   numéroté produit un procès-verbal SANS numéro, reconstitué depuis ses
 *   lignes ; aucun bon n'est créé à la volée.
 *
 * La construction est en deux temps, pour qu'elle se teste sans PDF : un
 * MODÈLE de document (tout le texte qui sera imprimé), puis son rendu
 * `pdf-lib`. Le téléchargement est tracé par le middleware d'accès
 * (`DOCUMENT_DOWNLOADED`, spec 023 §6) grâce au `Content-Disposition`.
 */

import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { ErrorCode, NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import {
  drawDocumentHeader,
  fontsOf,
  resolveDocumentBranding,
  truncate,
  type DocumentBranding
} from '../documents/document-branding';
import { sanitizeForPdf } from '../documents/pdf-text';
import { roundMoneyXof, roundQuantity } from './money';
import { formatSlipNumber } from './stock-bons';
import { buildStockMeta, entryLagDays, loadBlindLocationIds, maskMovementView, stockError } from './stock-controles';
import { loadAttachmentViews } from './stock-pieces-jointes';
import { toAmountOrZero } from './types';
import type {
  AttachmentView,
  MovementView,
  SlipView,
  StockCallerContext,
  StockCountKind,
  StockCountStatus,
  StockMeta,
  StockSlipKind,
  StockSlipSnapshot
} from './types-040-controle';

/** Devise unique du module (décision D9 du plan, actée au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

// ===========================================================================
// Formats d'impression
// ===========================================================================

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `04/10/2026` — jour UTC (heure légale de la Côte d'Ivoire). */
export function formatPdfDate(date: Date): string {
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** `04/10/2026 à 14:05` — heure serveur, UTC. */
export function formatPdfDateTime(date: Date): string {
  return `${formatPdfDate(date)} à ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
}

/** Quantité : jusqu'à 4 décimales, virgule décimale, groupes de trois chiffres. */
export function formatPdfQuantity(value: number): string {
  const rounded = roundQuantity(value);
  const negative = rounded < 0;
  const [integerPart, decimalPart] = Math.abs(rounded).toFixed(4).split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const decimals = decimalPart.replace(/0+$/, '');
  return `${negative ? '-' : ''}${grouped}${decimals ? `,${decimals}` : ''}`;
}

/** Montant en francs CFA, sans décimale (`1 250 000 XOF`). */
export function formatPdfMoney(value: number, currency: string = DEFAULT_CURRENCY): string {
  const rounded = Math.round(roundMoneyXof(value));
  const negative = rounded < 0;
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negative ? '-' : ''}${grouped} ${currency}`;
}

/** Prix unitaire : deux décimales au plus. */
function formatPdfUnitCost(value: number, currency: string): string {
  const [integerPart, decimalPart] = Math.abs(value).toFixed(2).split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const decimals = decimalPart === '00' ? '' : `,${decimalPart}`;
  return `${value < 0 ? '-' : ''}${grouped}${decimals} ${currency}`;
}

const MASKED = '-';

// ===========================================================================
// Modèle de document (tout ce qui sera imprimé)
// ===========================================================================

export interface StockPdfColumn {
  header: string;
  /** Part de la largeur utile (les parts d'un tableau se normalisent). */
  weight: number;
  align?: 'left' | 'right';
}

export interface StockPdfRow {
  cells: string[];
  /** Mention imprimée sous la ligne (ex. « comptée par une personne qui voyait le stock »). */
  note?: string;
}

export interface StockPdfSection {
  title: string;
  columns: StockPdfColumn[];
  rows: StockPdfRow[];
  /** Imprimé quand la rubrique est vide. */
  emptyText: string;
}

export interface StockPdfModel {
  /** Nom du fichier téléchargé, sans chemin. */
  fileName: string;
  title: string;
  /** Imprimé en gras sous le titre ; `null` pour un PV d'avant la numérotation. */
  number: string | null;
  info: Array<{ label: string; value: string }>;
  /** Mentions encadrées (dérogation, pièce signée…). */
  notices: string[];
  sections: StockPdfSection[];
  /** Totaux de valeur (vide sans STOCK_VALUES_VIEW). */
  totals: Array<{ label: string; value: string }>;
  signatures: [string, string];
  /** « Exemplaire réimprimé le … ». */
  reprintMention: string;
}

function reprintMention(printedAt: Date): string {
  return `Exemplaire réimprimé le ${formatPdfDateTime(printedAt)}`;
}

/** Empreintes des bons papier signés joints (B5-R4) : imprimées sur le bon. */
function signedSlipNotices(attachments: AttachmentView[]): string[] {
  return attachments
    .filter(attachment => attachment.purpose === 'SIGNED_SLIP' && !attachment.removed)
    .map(
      attachment =>
        `Bon signé joint le ${formatPdfDateTime(attachment.createdAt)} - empreinte SHA-256 : ${attachment.sha256}`
    );
}

/** Lecture tolérante du `snapshot` (JSON en base) : un champ absent vaut vide, jamais une erreur. */
export function readSlipSnapshot(raw: unknown): StockSlipSnapshot {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
  const invoice =
    source.invoice !== null && typeof source.invoice === 'object' ? (source.invoice as Record<string, unknown>) : null;
  const lines = Array.isArray(source.lines) ? source.lines : [];
  return {
    location: text(source.location) ?? '',
    site: text(source.site),
    taker: text(source.taker),
    requestedBy: text(source.requestedBy),
    invoice: invoice
      ? { reference: text(invoice.reference) ?? '', supplierName: text(invoice.supplierName) ?? '' }
      : null,
    author: text(source.author) ?? '',
    lines: lines
      .filter((line): line is Record<string, unknown> => line !== null && typeof line === 'object')
      .map(line => ({
        ...(text(line.movementId) ? { movementId: String(line.movementId) } : {}),
        itemId: text(line.itemId) ?? '',
        reference: text(line.reference) ?? '',
        label: text(line.label) ?? '',
        unit: text(line.unit) ?? ''
      })),
    ...(Array.isArray(source.counters)
      ? { counters: source.counters.filter((c): c is string => typeof c === 'string') }
      : {}),
    ...(text(source.validator) ? { validator: String(source.validator) } : {})
  };
}

type SnapshotLine = StockSlipSnapshot['lines'][number];

/** Le libellé figé d'une ligne : par mouvement, puis par article ; à défaut, le libellé courant. */
function frozenLine(
  snapshot: StockSlipSnapshot,
  movementId: string | null,
  itemId: string,
  fallback: { reference: string; label: string; unit: string }
): { reference: string; label: string; unit: string } {
  const byMovement = movementId ? snapshot.lines.find(line => line.movementId === movementId) : undefined;
  const found: SnapshotLine | undefined = byMovement ?? snapshot.lines.find(line => line.itemId === itemId);
  return found ? { reference: found.reference, label: found.label, unit: found.unit } : fallback;
}

// ---------------------------------------------------------------------------
// BR et BS
// ---------------------------------------------------------------------------

export interface SlipPdfInput {
  slip: {
    kind: Exclude<StockSlipKind, 'COUNT_REPORT'>;
    number: string;
    documentDate: Date;
    createdAt: Date;
    snapshot: StockSlipSnapshot;
  };
  /** Mouvements du bon, DÉJÀ masqués pour l'appelant (`maskMovementView`). */
  movements: MovementView[];
  attachments: AttachmentView[];
  ctx: StockCallerContext;
  printedAt: Date;
}

/** Modèle d'un bon de réception ou de sortie (B4-R2). */
export function buildSlipPdfModel(input: SlipPdfInput): StockPdfModel {
  const { slip, movements, ctx } = input;
  const snapshot = slip.snapshot;
  const isReceipt = slip.kind === 'RECEIPT';
  const currency = movements[0]?.currency ?? DEFAULT_CURRENCY;

  const info: StockPdfModel['info'] = [
    { label: 'Date du document', value: formatPdfDate(slip.documentDate) },
    { label: 'Enregistré le', value: formatPdfDateTime(slip.createdAt) },
    { label: 'Lieu', value: snapshot.location || MASKED }
  ];
  if (snapshot.site) info.push({ label: 'Chantier', value: snapshot.site });
  if (isReceipt) {
    if (snapshot.invoice) {
      info.push({
        label: 'Facture',
        value: [snapshot.invoice.reference, snapshot.invoice.supplierName].filter(Boolean).join(' - ')
      });
    }
  } else if (snapshot.taker) {
    info.push({ label: 'Preneur', value: snapshot.taker });
  } else if (snapshot.requestedBy) {
    info.push({ label: 'Demandeur', value: snapshot.requestedBy });
  }
  info.push({ label: 'Établi par', value: snapshot.author || MASKED });

  const columns: StockPdfColumn[] = [
    { header: 'Référence', weight: 2 },
    { header: 'Désignation', weight: 5 },
    { header: 'Unité', weight: 1.4 },
    { header: 'Quantité', weight: 1.6, align: 'right' }
  ];
  if (ctx.valuesVisible) {
    columns.push({ header: 'Prix unitaire', weight: 2, align: 'right' });
    columns.push({ header: 'Valeur', weight: 2.2, align: 'right' });
  }

  const rows: StockPdfRow[] = movements.map(movement => {
    const line = frozenLine(snapshot, movement.id, movement.itemId, {
      reference: movement.itemReference,
      label: movement.itemLabel,
      unit: movement.itemUnit
    });
    const cells = [line.reference, line.label, line.unit, formatPdfQuantity(movement.quantity)];
    if (ctx.valuesVisible) {
      cells.push(movement.unitCost === null ? MASKED : formatPdfUnitCost(movement.unitCost, currency));
      cells.push(movement.totalValue === null ? MASKED : formatPdfMoney(movement.totalValue, currency));
    }
    return { cells };
  });

  const totals: StockPdfModel['totals'] = [];
  if (ctx.valuesVisible && movements.length > 0 && movements.every(movement => movement.totalValue !== null)) {
    const total = movements.reduce((sum, movement) => sum + (movement.totalValue ?? 0), 0);
    totals.push({ label: 'Valeur totale', value: formatPdfMoney(total, currency) });
  }

  return {
    fileName: `${slip.number}.pdf`,
    title: isReceipt ? 'Bon de réception' : 'Bon de sortie',
    number: slip.number,
    info,
    notices: signedSlipNotices(input.attachments),
    sections: [{ title: 'Articles', columns, rows, emptyText: 'Aucun article.' }],
    totals,
    signatures: isReceipt ? ['Livré par', 'Reçu par (magasinier)'] : ['Remis par (magasinier)', 'Reçu par (preneur)'],
    reprintMention: reprintMention(input.printedAt)
  };
}

// ---------------------------------------------------------------------------
// PVI
// ---------------------------------------------------------------------------

export interface CountReportLineInput {
  itemId: string;
  reference: string;
  label: string;
  unit: string;
  expectedQuantity: number;
  /** `null` : ligne non comptée (A2-R8). */
  countedQuantity: number | null;
  /** Faux : comptée par une personne qui voyait le stock (A2-R9). */
  countedBlind: boolean | null;
  setAside: boolean;
  setAsideReason: string | null;
  /** `null` : ligne d'avant le lot, « non mesuré » (A3-R4). */
  movementsSinceCapture: number | null;
  unitCostAtValidation: number | null;
  reasonLabel: string | null;
}

export interface CountReportPdfInput {
  /** `null` : inventaire validé avant la numérotation (B4-R3 bis). */
  number: string | null;
  kind: StockCountKind;
  countedAt: Date;
  validatedAt: Date | null;
  location: string;
  site: string | null;
  counters: string[];
  validator: string;
  selfValidated: boolean;
  selfValidationReason: string | null;
  lines: CountReportLineInput[];
  values: {
    countedValue: number | null;
    varianceValueGross: number | null;
    varianceValueNet: number | null;
    setAsideVarianceValue: number | null;
  };
  attachments: AttachmentView[];
  ctx: StockCallerContext;
  printedAt: Date;
}

const COUNT_KIND_LABEL: Record<StockCountKind, string> = {
  REGULAR: 'Inventaire courant',
  OPENING: "Inventaire d'ouverture",
  CLOSING: 'Inventaire de clôture'
};

/**
 * Libellés imprimés des motifs : ceux de la spec §4, qui sont aussi ceux de
 * l'écran (`STOCK_REASON_LABELS` côté web). Le PDF est en français. Seules
 * exceptions, voulues : « Autre » et « Stock d'ouverture » perdent la
 * parenthèse qui guide la saisie (« précision obligatoire », « posé par le
 * système ») ; la précision saisie suit le motif entre parenthèses.
 */
export const STOCK_REASON_PDF_LABELS: Record<string, string> = {
  BREAKAGE: 'Casse',
  DETERIORATION: 'Détérioration (humidité, péremption)',
  COUNTING_ERROR: 'Erreur du comptage précédent',
  ENTRY_ERROR: "Erreur de saisie d'un mouvement",
  UNIT_CONFUSION: "Confusion d'unité",
  UNRECORDED_ISSUE: 'Sortie non enregistrée',
  UNRECORDED_RECEIPT: 'Réception non enregistrée',
  UNEXPLAINED_DISAPPEARANCE: 'Disparition non expliquée',
  OPENING_BALANCE: "Stock d'ouverture",
  OTHER: 'Autre'
};

export const PRE_NUMBERING_COUNT_REPORT_TITLE = "Procès-verbal d'inventaire (antérieur à la numérotation)";

/** Modèle d'un procès-verbal d'inventaire (B4-R2, B4-R3 bis). */
export function buildCountReportPdfModel(input: CountReportPdfInput): StockPdfModel {
  const { ctx } = input;
  const currency = DEFAULT_CURRENCY;

  const info: StockPdfModel['info'] = [
    { label: 'Nature', value: COUNT_KIND_LABEL[input.kind] ?? COUNT_KIND_LABEL.REGULAR },
    { label: 'Date du comptage', value: formatPdfDate(input.countedAt) },
    { label: 'Validé le', value: input.validatedAt ? formatPdfDateTime(input.validatedAt) : MASKED },
    { label: 'Lieu', value: input.location || MASKED }
  ];
  if (input.site) info.push({ label: 'Chantier', value: input.site });
  info.push({ label: 'Compté par', value: input.counters.length > 0 ? input.counters.join(', ') : MASKED });
  info.push({ label: 'Validé par', value: input.validator || MASKED });

  const notices: string[] = [];
  if (input.selfValidated) {
    notices.push(
      `Validé par une personne qui a aussi compté (dérogation)${
        input.selfValidationReason ? ` - motif : ${input.selfValidationReason}` : ''
      }.`
    );
  }
  notices.push(...signedSlipNotices(input.attachments));

  const baseColumns: StockPdfColumn[] = [
    { header: 'Référence', weight: 1.8 },
    { header: 'Désignation', weight: 3.6 },
    { header: 'Unité', weight: 1.1 },
    { header: 'Attendu', weight: 1.4, align: 'right' },
    { header: 'Compté', weight: 1.4, align: 'right' },
    { header: 'Écart', weight: 1.3, align: 'right' }
  ];
  const valueColumns: StockPdfColumn[] = ctx.valuesVisible
    ? [
        { header: 'Coût unitaire', weight: 1.8, align: 'right' },
        { header: 'Écart valorisé', weight: 2, align: 'right' }
      ]
    : [];
  const movementsColumn: StockPdfColumn = { header: 'Mvts après', weight: 1.3, align: 'right' };

  const blindNote = 'Comptée par une personne qui voyait le stock.';

  const lineCells = (line: CountReportLineInput, withCounted: boolean): string[] => {
    const variance = line.countedQuantity === null ? null : line.countedQuantity - line.expectedQuantity;
    const cells = [
      line.reference,
      line.label,
      line.unit,
      formatPdfQuantity(line.expectedQuantity),
      withCounted && line.countedQuantity !== null ? formatPdfQuantity(line.countedQuantity) : MASKED,
      variance === null ? MASKED : formatPdfQuantity(variance)
    ];
    if (ctx.valuesVisible) {
      // Un surplus d'inventaire d'ouverture est entré à valeur nulle (A7-R2) :
      // il s'imprime à 0, comme l'écriture d'ajustement et la vue de l'inventaire.
      const openingSurplus = input.kind === 'OPENING' && variance !== null && variance > 0;
      const unitCost = openingSurplus ? 0 : line.unitCostAtValidation;
      cells.push(unitCost === null ? MASKED : formatPdfUnitCost(unitCost, currency));
      cells.push(variance === null || unitCost === null ? MASKED : formatPdfMoney(variance * unitCost, currency));
    }
    cells.push(line.movementsSinceCapture === null ? 'non mesuré' : String(line.movementsSinceCapture));
    return cells;
  };

  const noteOf = (line: CountReportLineInput, extra: string | null): string | undefined => {
    const parts = [line.countedBlind === false ? blindNote : null, line.reasonLabel, extra].filter(
      (part): part is string => Boolean(part)
    );
    return parts.length > 0 ? parts.join(' ') : undefined;
  };

  const columns = [...baseColumns, ...valueColumns, movementsColumn];
  const adjusted = input.lines.filter(line => line.countedQuantity !== null && !line.setAside);
  const setAside = input.lines.filter(line => line.countedQuantity !== null && line.setAside);
  const uncounted = input.lines.filter(line => line.countedQuantity === null);

  const sections: StockPdfSection[] = [
    {
      title: 'Lignes comptées',
      columns,
      rows: adjusted.map(line => ({ cells: lineCells(line, true), note: noteOf(line, null) })),
      emptyText: 'Aucune ligne comptée.'
    },
    {
      title: 'Lignes écartées (non ajustées, à recompter)',
      columns,
      rows: setAside.map(line => ({
        cells: lineCells(line, true),
        note: noteOf(line, line.setAsideReason ? `Écartée : ${line.setAsideReason}` : null)
      })),
      emptyText: 'Aucune ligne écartée.'
    },
    {
      title: 'Non comptés (écartés, à recompter)',
      columns,
      rows: uncounted.map(line => ({
        cells: lineCells(line, false),
        note: noteOf(line, line.setAsideReason ? `Écartée : ${line.setAsideReason}` : null)
      })),
      emptyText: 'Aucun article non compté.'
    }
  ];

  const totals: StockPdfModel['totals'] = [];
  if (ctx.valuesVisible) {
    const add = (label: string, value: number | null) => {
      if (value !== null) totals.push({ label, value: formatPdfMoney(value, currency) });
    };
    add('Valeur comptée', input.values.countedValue);
    add('Écart brut (somme des écarts en valeur absolue)', input.values.varianceValueGross);
    add('Écart net', input.values.varianceValueNet);
    add('Écart des lignes écartées', input.values.setAsideVarianceValue);
  }

  const dateForName = formatPdfDate(input.countedAt).split('/').reverse().join('-');
  return {
    fileName: input.number ? `${input.number}.pdf` : `PV-inventaire-${dateForName}.pdf`,
    title: input.number ? "Procès-verbal d'inventaire" : PRE_NUMBERING_COUNT_REPORT_TITLE,
    number: input.number,
    info,
    notices,
    sections,
    totals,
    signatures: ['Compté par', 'Validé par'],
    reprintMention: reprintMention(input.printedAt)
  };
}

// ===========================================================================
// Rendu pdf-lib
// ===========================================================================

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const FOOTER_SPACE = 40;
const ROW_HEIGHT = 14;
const GREY = rgb(0.35, 0.35, 0.35);
const RULE = rgb(0.75, 0.75, 0.75);

/** Découpe un texte en lignes qui tiennent dans `maxWidth` (mots entiers, puis coupe dure). */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(sanitizeForPdf(candidate), size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.map(line => truncate(line, font, size, maxWidth));
}

/**
 * Dessine le modèle : en-tête de l'agence sur la première page, en-tête court
 * sur les suivantes, tableaux paginés, totaux, zones de signature, puis la
 * mention de réimpression et le numéro de page au pied de chaque page.
 */
export async function renderStockPdf(model: StockPdfModel, branding: DocumentBranding): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(sanitizeForPdf(model.number ? `${model.title} ${model.number}` : model.title));
  pdfDoc.setLanguage('fr-FR');
  const { regular, bold } = await fontsOf(pdfDoc);
  const contentWidth = PAGE_WIDTH - 2 * MARGIN;

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = await drawDocumentHeader(pdfDoc, page, branding, { title: model.title });

  const newPage = () => {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    const heading = model.number ? `${model.title} - ${model.number} (suite)` : `${model.title} (suite)`;
    page.drawText(truncate(heading, bold, 10, contentWidth), { x: MARGIN, y, size: 10, font: bold });
    y -= 22;
  };
  const ensure = (height: number) => {
    if (y - height < MARGIN + FOOTER_SPACE) newPage();
  };

  if (model.number) {
    page.drawText(truncate(`N° ${model.number}`, bold, 14, contentWidth), { x: MARGIN, y, size: 14, font: bold });
    y -= 24;
  }

  for (const entry of model.info) {
    ensure(ROW_HEIGHT);
    page.drawText(truncate(`${entry.label} :`, bold, 9, 130), { x: MARGIN, y, size: 9, font: bold });
    page.drawText(truncate(entry.value, regular, 9, contentWidth - 140), {
      x: MARGIN + 140,
      y,
      size: 9,
      font: regular
    });
    y -= ROW_HEIGHT;
  }

  for (const notice of model.notices) {
    const lines = wrapText(notice, regular, 8.5, contentWidth - 12);
    const noticeHeight = lines.length * 11 + 6;
    ensure(noticeHeight + 10);
    y -= 4;
    page.drawRectangle({
      x: MARGIN,
      y: y + 10 - noticeHeight,
      width: contentWidth,
      height: noticeHeight,
      borderColor: RULE,
      borderWidth: 0.6
    });
    for (const line of lines) {
      page.drawText(line, { x: MARGIN + 6, y, size: 8.5, font: regular });
      y -= 11;
    }
    y -= 8;
  }

  for (const section of model.sections) {
    y -= 8;
    ensure(ROW_HEIGHT * 3);
    page.drawText(truncate(section.title, bold, 10.5, contentWidth), { x: MARGIN, y, size: 10.5, font: bold });
    y -= ROW_HEIGHT + 2;

    const totalWeight = section.columns.reduce((sum, column) => sum + column.weight, 0) || 1;
    const widths = section.columns.map(column => (column.weight / totalWeight) * contentWidth);
    const drawCells = (cells: string[], font: PDFFont, size: number) => {
      let x = MARGIN;
      section.columns.forEach((column, index) => {
        const width = widths[index];
        const text = truncate(cells[index] ?? '', font, size, width - 4);
        const textWidth = font.widthOfTextAtSize(text, size);
        const drawX = column.align === 'right' ? x + width - 2 - textWidth : x + 2;
        page.drawText(text, { x: drawX, y, size, font });
        x += width;
      });
    };
    const drawHeaderRow = () => {
      drawCells(
        section.columns.map(column => column.header),
        bold,
        8
      );
      y -= 4;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + contentWidth, y }, thickness: 0.5, color: RULE });
      y -= ROW_HEIGHT - 4;
    };
    drawHeaderRow();

    if (section.rows.length === 0) {
      page.drawText(truncate(section.emptyText, regular, 8.5, contentWidth), {
        x: MARGIN + 2,
        y,
        size: 8.5,
        font: regular,
        color: GREY
      });
      y -= ROW_HEIGHT;
      continue;
    }
    for (const row of section.rows) {
      const noteLines = row.note ? wrapText(row.note, regular, 7, contentWidth - 20) : [];
      if (y - (ROW_HEIGHT + noteLines.length * 9) < MARGIN + FOOTER_SPACE) {
        newPage();
        drawHeaderRow();
      }
      drawCells(row.cells, regular, 8);
      y -= ROW_HEIGHT;
      for (const line of noteLines) {
        page.drawText(line, { x: MARGIN + 14, y: y + 3, size: 7, font: regular, color: GREY });
        y -= 9;
      }
    }
  }

  if (model.totals.length > 0) {
    y -= 6;
    ensure(model.totals.length * ROW_HEIGHT + 10);
    for (const total of model.totals) {
      const label = truncate(`${total.label} :`, bold, 9, contentWidth - 140);
      page.drawText(label, { x: MARGIN, y, size: 9, font: bold });
      const value = truncate(total.value, regular, 9, 130);
      page.drawText(value, {
        x: MARGIN + contentWidth - regular.widthOfTextAtSize(value, 9),
        y,
        size: 9,
        font: regular
      });
      y -= ROW_HEIGHT;
    }
  }

  // Zones de signature : deux cadres côte à côte.
  const boxHeight = 80;
  y -= 14;
  ensure(boxHeight + 20);
  const boxWidth = (contentWidth - 20) / 2;
  model.signatures.forEach((label, index) => {
    const x = MARGIN + index * (boxWidth + 20);
    page.drawText(truncate(label, bold, 9, boxWidth), { x, y, size: 9, font: bold });
    page.drawRectangle({
      x,
      y: y - boxHeight - 6,
      width: boxWidth,
      height: boxHeight,
      borderColor: RULE,
      borderWidth: 0.6
    });
    page.drawText(truncate('Nom, date et signature', regular, 7, boxWidth - 8), {
      x: x + 4,
      y: y - boxHeight,
      size: 7,
      font: regular,
      color: GREY
    });
  });

  const pages = pdfDoc.getPages();
  pages.forEach((current, index) => {
    const footer = truncate(`${model.reprintMention} - page ${index + 1}/${pages.length}`, regular, 7.5, contentWidth);
    current.drawText(footer, { x: MARGIN, y: MARGIN - 14, size: 7.5, font: regular, color: GREY });
  });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

// ===========================================================================
// Lectures en base
// ===========================================================================

function userLabel(user?: { fullName?: string | null; email?: string | null } | null): string {
  return user?.fullName || user?.email || 'Utilisateur inconnu';
}

function takerLabel(taker?: { fullName?: string | null; teamOrCompany?: string | null } | null): string | null {
  if (!taker?.fullName) return null;
  return taker.teamOrCompany ? `${taker.fullName} - ${taker.teamOrCompany}` : taker.fullName;
}

const MOVEMENT_SELECT = {
  id: true,
  type: true,
  itemId: true,
  locationId: true,
  movementDate: true,
  quantity: true,
  isDecrease: true,
  unitCost: true,
  totalValue: true,
  currency: true,
  quantityAfter: true,
  valueAfter: true,
  siteId: true,
  requestedBy: true,
  supplierInvoiceId: true,
  transferGroupId: true,
  stockCountId: true,
  slipId: true,
  reasonCode: true,
  reason: true,
  takerId: true,
  valuationSource: true,
  supplierCreditValue: true,
  createdByUserId: true,
  createdAt: true,
  item: { select: { reference: true, label: true, unit: true } },
  location: { select: { label: true } },
  site: { select: { name: true } },
  costCategory: { select: { label: true } },
  supplierInvoice: { select: { reference: true } },
  createdBy: { select: { fullName: true, email: true } },
  taker: { select: { fullName: true, teamOrCompany: true } },
  slip: { select: { kind: true, year: true, number: true } },
  _count: { select: { attachments: { where: { removedAt: null } } } }
} as const;

/** Conversion d'une ligne Prisma vers le contrat `MovementView` (avant masquage). Recopiée, comme au journal. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMovementView(row: any): MovementView {
  const nullableAmount = (value: unknown) =>
    value === null || value === undefined ? null : roundMoneyXof(toAmountOrZero(value as number));
  return {
    id: row.id,
    type: row.type,
    itemId: row.itemId,
    itemReference: row.item?.reference ?? 'Article inconnu',
    itemLabel: row.item?.label ?? 'Article inconnu',
    itemUnit: row.item?.unit ?? '',
    locationId: row.locationId,
    locationLabel: row.location?.label ?? 'Lieu inconnu',
    movementDate: row.movementDate,
    quantity: roundQuantity(toAmountOrZero(row.quantity)),
    isDecrease: row.isDecrease === true,
    unitCost: roundQuantity(toAmountOrZero(row.unitCost)),
    totalValue: roundMoneyXof(toAmountOrZero(row.totalValue)),
    currency: row.currency ?? DEFAULT_CURRENCY,
    quantityAfter: roundQuantity(toAmountOrZero(row.quantityAfter)),
    valueAfter: roundMoneyXof(toAmountOrZero(row.valueAfter)),
    siteId: row.siteId ?? null,
    siteLabel: row.site?.name ?? null,
    costCategoryLabel: row.costCategory?.label ?? null,
    requestedBy: row.requestedBy ?? null,
    supplierInvoiceReference: row.supplierInvoice?.reference ?? null,
    transferGroupId: row.transferGroupId ?? null,
    createdByLabel: userLabel(row.createdBy),
    createdAt: row.createdAt,
    takerId: row.takerId ?? null,
    takerLabel: takerLabel(row.taker),
    supplierInvoiceId: row.supplierInvoiceId ?? null,
    stockCountId: row.stockCountId ?? null,
    slipId: row.slipId ?? null,
    slipNumber: row.slip ? formatSlipNumber(row.slip.kind, row.slip.year, row.slip.number) : null,
    reasonCode: row.reasonCode ?? null,
    reason: row.reason ?? null,
    valuationSource: row.valuationSource ?? null,
    supplierCreditValue: nullableAmount(row.supplierCreditValue),
    createdByUserId: row.createdByUserId,
    entryLagDays: entryLagDays(row.createdAt, row.movementDate),
    attachmentsCount: row._count?.attachments ?? 0
  };
}

const SLIP_SELECT = {
  id: true,
  kind: true,
  year: true,
  number: true,
  documentDate: true,
  createdAt: true,
  locationId: true,
  siteId: true,
  takerId: true,
  requestedBy: true,
  supplierInvoiceId: true,
  stockCountId: true,
  snapshot: true,
  createdBy: { select: { fullName: true, email: true } },
  location: { select: { label: true } },
  site: { select: { name: true } },
  taker: { select: { fullName: true, teamOrCompany: true } },
  supplierInvoice: { select: { reference: true, supplier: { select: { name: true } } } }
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSlip(tenantId: string, slipId: string): Promise<any> {
  const slip = await prisma.stockSlip.findFirst({ where: { id: slipId, tenantId }, select: SLIP_SELECT });
  if (!slip) throw new NotFoundError('Bon introuvable.');
  return slip;
}

/** Mouvements d'un bon : ceux qui le portent ; pour un PVI, les ajustements de son inventaire. */
async function loadSlipMovements(
  tenantId: string,
  slip: { id: string; kind: StockSlipKind; stockCountId: string | null }
): Promise<MovementView[]> {
  const where =
    slip.kind === 'COUNT_REPORT' && slip.stockCountId
      ? {
          tenantId,
          OR: [{ slipId: slip.id }, { stockCountId: slip.stockCountId, type: 'ADJUSTMENT' as const }]
        }
      : { tenantId, slipId: slip.id };
  const rows = await prisma.stockMovement.findMany({
    where,
    select: MOVEMENT_SELECT,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  return rows.map(toMovementView);
}

/**
 * `GET /stock/slips/{slipId}` : le bon, ses mouvements et ses pièces jointes,
 * masqués pour l'appelant (spec §8.1, §8.2). Les libellés du bon sont ceux du
 * `snapshot` (figés) ; ceux des mouvements sont les libellés courants du
 * journal.
 */
export async function getStockSlipView(
  tenantId: string,
  ctx: StockCallerContext,
  slipId: string
): Promise<{ data: SlipView; meta: StockMeta }> {
  const slip = await loadSlip(tenantId, slipId);
  const snapshot = readSlipSnapshot(slip.snapshot);
  const [rawMovements, blind, attachments] = await Promise.all([
    loadSlipMovements(tenantId, slip),
    loadBlindLocationIds(prisma, tenantId, ctx),
    loadAttachmentViews(prisma, tenantId, ctx, 'SLIP', slip.id)
  ]);
  const movements = rawMovements.map(movement => maskMovementView(movement, ctx, blind));

  let totalValue: number | null = null;
  if (ctx.valuesVisible) {
    const signed = slip.kind === 'COUNT_REPORT';
    totalValue = roundMoneyXof(
      rawMovements.reduce(
        (sum, movement) => sum + (signed && movement.isDecrease ? -1 : 1) * (movement.totalValue ?? 0),
        0
      )
    );
  }

  const data: SlipView = {
    id: slip.id,
    kind: slip.kind,
    number: formatSlipNumber(slip.kind, slip.year, slip.number),
    documentDate: slip.documentDate,
    createdAt: slip.createdAt,
    location: { id: slip.locationId, label: snapshot.location || slip.location?.label || 'Lieu inconnu' },
    site: slip.siteId ? { id: slip.siteId, name: snapshot.site ?? slip.site?.name ?? 'Chantier' } : null,
    taker: slip.takerId ? { id: slip.takerId, label: snapshot.taker ?? takerLabel(slip.taker) ?? 'Preneur' } : null,
    requestedBy: snapshot.requestedBy ?? slip.requestedBy ?? null,
    supplierInvoice: slip.supplierInvoiceId
      ? {
          id: slip.supplierInvoiceId,
          reference: snapshot.invoice?.reference || slip.supplierInvoice?.reference || '',
          supplierName: snapshot.invoice?.supplierName || slip.supplierInvoice?.supplier?.name || ''
        }
      : null,
    stockCountId: slip.stockCountId ?? null,
    createdByLabel: snapshot.author || userLabel(slip.createdBy),
    totalValue,
    currency: rawMovements[0]?.currency ?? DEFAULT_CURRENCY,
    movements,
    attachments
  };
  return { data, meta: buildStockMeta(ctx, blind) };
}

/** Un PDF prêt à envoyer. */
export interface StockPdfFile {
  buffer: Buffer;
  fileName: string;
}

/**
 * `GET /stock/slips/{slipId}/pdf`. Un PVI se télécharge plutôt par
 * `/stock/counts/{countId}/report.pdf` ; demandé ici, il sort identique.
 */
export async function buildStockSlipPdf(
  tenantId: string,
  ctx: StockCallerContext,
  slipId: string,
  printedAt: Date = new Date()
): Promise<StockPdfFile> {
  const slip = await loadSlip(tenantId, slipId);
  if (slip.kind === 'COUNT_REPORT') {
    if (!slip.stockCountId) throw new NotFoundError('Inventaire introuvable.');
    return buildStockCountReportPdf(tenantId, ctx, slip.stockCountId, printedAt);
  }
  const [rawMovements, blind, attachments, branding] = await Promise.all([
    loadSlipMovements(tenantId, slip),
    loadBlindLocationIds(prisma, tenantId, ctx),
    loadAttachmentViews(prisma, tenantId, ctx, 'SLIP', slip.id),
    resolveDocumentBranding(tenantId, null)
  ]);
  const model = buildSlipPdfModel({
    slip: {
      kind: slip.kind,
      number: formatSlipNumber(slip.kind, slip.year, slip.number),
      documentDate: slip.documentDate,
      createdAt: slip.createdAt,
      snapshot: readSlipSnapshot(slip.snapshot)
    },
    movements: rawMovements.map(movement => maskMovementView(movement, ctx, blind)),
    attachments,
    ctx,
    printedAt
  });
  return { buffer: await renderStockPdf(model, branding), fileName: model.fileName };
}

const nullableNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : toAmountOrZero(value as number);

/**
 * `GET /stock/counts/{countId}/report.pdf` (B4-R2, B4-R3 bis). VALIDATED
 * seulement : un PVI naît à la validation (`409 STOCK_COUNT_WRONG_STATUS`
 * sinon). Un PV n'est jamais à l'aveugle : l'inventaire validé a révélé ses
 * écarts. Les montants restent réservés à STOCK_VALUES_VIEW.
 */
export async function buildStockCountReportPdf(
  tenantId: string,
  ctx: StockCallerContext,
  countId: string,
  printedAt: Date = new Date()
): Promise<StockPdfFile> {
  const count = await prisma.stockCount.findFirst({
    where: { id: countId, tenantId },
    select: {
      id: true,
      kind: true,
      status: true,
      countedAt: true,
      validatedAt: true,
      counterUserIds: true,
      selfValidated: true,
      selfValidationReason: true,
      countedValue: true,
      varianceValueGross: true,
      varianceValueNet: true,
      setAsideVarianceValue: true,
      createdBy: { select: { fullName: true, email: true } },
      validatedBy: { select: { fullName: true, email: true } },
      location: { select: { label: true, site: { select: { name: true } } } },
      slip: { select: { id: true, kind: true, year: true, number: true, snapshot: true } }
    }
  });
  if (!count) throw new NotFoundError('Inventaire introuvable.');
  if ((count.status as StockCountStatus) !== 'VALIDATED') {
    throw stockError(
      409,
      ErrorCode.STOCK_COUNT_WRONG_STATUS,
      "Le procès-verbal n'existe qu'une fois l'inventaire validé."
    );
  }

  const [lines, counterUsers, attachments, branding] = await Promise.all([
    prisma.stockCountLine.findMany({
      where: { countId: count.id, count: { tenantId } },
      select: {
        itemId: true,
        expectedQuantity: true,
        countedQuantity: true,
        countedBlind: true,
        reasonCode: true,
        reason: true,
        setAsideAt: true,
        setAsideReason: true,
        unitCostAtValidation: true,
        movementsSinceCapture: true,
        item: { select: { reference: true, label: true, unit: true } }
      },
      orderBy: [{ item: { reference: 'asc' } }]
    }),
    count.slip || count.counterUserIds.length === 0
      ? Promise.resolve([] as Array<{ id: string; fullName: string | null; email: string | null }>)
      : prisma.user.findMany({
          where: { id: { in: count.counterUserIds } },
          select: { id: true, fullName: true, email: true }
        }),
    count.slip ? loadAttachmentViews(prisma, tenantId, ctx, 'SLIP', count.slip.id) : Promise.resolve([]),
    resolveDocumentBranding(tenantId, null)
  ]);

  const snapshot = count.slip ? readSlipSnapshot(count.slip.snapshot) : null;
  const liveCounters =
    counterUsers.length > 0
      ? count.counterUserIds.map(id => userLabel(counterUsers.find(user => user.id === id)))
      : [userLabel(count.createdBy)];
  const counters = snapshot?.counters && snapshot.counters.length > 0 ? snapshot.counters : liveCounters;

  const reportLines: CountReportLineInput[] = lines.map(line => {
    const current = {
      reference: line.item?.reference ?? 'Article inconnu',
      label: line.item?.label ?? 'Article inconnu',
      unit: line.item?.unit ?? ''
    };
    const frozen = snapshot ? frozenLine(snapshot, null, line.itemId, current) : current;
    const reasonLabel = line.reasonCode
      ? `Motif : ${STOCK_REASON_PDF_LABELS[line.reasonCode] ?? line.reasonCode}${line.reason ? ` (${line.reason})` : ''}.`
      : line.reason
        ? `Motif : ${line.reason}.`
        : null;
    return {
      itemId: line.itemId,
      ...frozen,
      expectedQuantity: roundQuantity(toAmountOrZero(line.expectedQuantity)),
      countedQuantity: line.countedQuantity === null ? null : roundQuantity(toAmountOrZero(line.countedQuantity)),
      countedBlind: line.countedBlind ?? null,
      setAside: line.setAsideAt !== null,
      setAsideReason: line.setAsideReason ?? null,
      movementsSinceCapture: line.movementsSinceCapture ?? null,
      unitCostAtValidation: nullableNumber(line.unitCostAtValidation),
      reasonLabel
    };
  });

  const model = buildCountReportPdfModel({
    number: count.slip ? formatSlipNumber(count.slip.kind, count.slip.year, count.slip.number) : null,
    kind: count.kind,
    countedAt: count.countedAt,
    validatedAt: count.validatedAt ?? null,
    location: snapshot?.location || count.location?.label || 'Lieu inconnu',
    site: snapshot ? snapshot.site : (count.location?.site?.name ?? null),
    counters,
    validator: snapshot?.validator || userLabel(count.validatedBy),
    selfValidated: count.selfValidated,
    selfValidationReason: count.selfValidationReason ?? null,
    lines: reportLines,
    values: {
      countedValue: nullableNumber(count.countedValue),
      varianceValueGross: nullableNumber(count.varianceValueGross),
      varianceValueNet: nullableNumber(count.varianceValueNet),
      setAsideVarianceValue: nullableNumber(count.setAsideVarianceValue)
    },
    attachments,
    ctx,
    printedAt
  });
  return { buffer: await renderStockPdf(model, branding), fileName: model.fileName };
}
