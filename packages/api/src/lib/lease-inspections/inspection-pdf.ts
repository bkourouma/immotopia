/**
 * PDF d'un état des lieux FINALISÉ (spec 043, lot S3) : le document que les
 * parties signent. Deux temps, comme `finance/stock-bons-pdf.ts` : un MODÈLE
 * (tout le texte imprimé, testable sans PDF) puis son rendu `pdf-lib`.
 *
 * Règles :
 *
 * - **Français** : pièce contractuelle, imprimée avec Helvetica (WinAnsi).
 *   Tout texte passe par `sanitizeForPdf` (via `truncate`) : un libellé saisi
 *   en arabe sort remplacé, jamais en erreur.
 * - **Photos** : lues dans le dossier PRIVÉ `uploads/lease-inspections/<agence>/<état>/`
 *   par le NOM de fichier seul (le chemin stocké en base n'est jamais suivi tel
 *   quel) ; aucun chemin disque n'apparaît dans le document. JPEG et PNG
 *   seulement (pdf-lib n'embarque pas le WebP) ; une photo illisible, trop
 *   lourde ou d'un autre format est SAUTÉE avec une mention, jamais une erreur.
 *   Sans bibliothèque d'image côté API, l'image est embarquée à sa taille
 *   d'origine : le volume total est donc plafonné (`MAX_EMBEDDED_BYTES`).
 * - **Figé** : le contenu vient de l'état des lieux tel qu'enregistré ; seul
 *   l'en-tête de l'agence est relu (`document-branding.ts`).
 */
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { env } from '../../config/env';
import { NotFoundError } from '../../middleware/error-middleware';
import { prisma } from '../../utils/database';
import { getUploadsRoot } from '../../utils/project-root';
import {
  drawDocumentHeader,
  embedImage,
  fitInBox,
  fontsOf,
  resolveDocumentBranding,
  truncate,
  type DocumentBranding,
  type DocumentImage
} from '../documents/document-branding';
import { detectImageFormat, readImageDimensions } from '../documents/branding-storage';
import { sanitizeForPdf } from '../documents/pdf-text';
import {
  itemKind,
  normalizeDeductions,
  normalizeRooms,
  type Condition,
  type Deduction,
  type InspectionMeters,
  type InspectionRoom
} from './inventory';

// ===========================================================================
// Formats
// ===========================================================================

const pad2 = (value: number) => String(value).padStart(2, '0');

/** `04/10/2026` — jour UTC (les dates d'état des lieux sont posées à midi UTC). */
export function formatInspectionDate(date: Date): string {
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** Montant en francs CFA, sans décimale ni espace insécable (`1 250 000 FCFA`). */
export function formatInspectionMoney(value: number): string {
  const rounded = Math.round(value);
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '-' : ''}${grouped} FCFA`;
}

const CONDITION_LABELS: Record<Condition, string> = {
  NEW: 'Neuf',
  GOOD: 'Bon',
  FAIR: 'Usagé',
  POOR: 'Mauvais',
  BROKEN: 'HS',
  MISSING: 'Manquant'
};

const conditionLabel = (condition: Condition | null | undefined) =>
  condition ? (CONDITION_LABELS[condition] ?? condition) : 'Non renseigné';

const DEDUCTION_SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Saisie',
  DEGRADED: 'Dégradation',
  MISSING: 'Manquant',
  KEYS: 'Clés'
};

// ===========================================================================
// Photos : lecture dans le dossier privé de l'état des lieux
// ===========================================================================

/** Au-delà, une photo n'est pas reproduite (la route d'envoi plafonne déjà à 10 Mo). */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** Volume d'images embarquées dans un PDF (pas de redimensionnement possible). */
export const MAX_EMBEDDED_BYTES = 30 * 1024 * 1024;
export const MAX_EMBEDDED_PHOTOS = 40;
/** Un PNG est décompressé par pdf-lib : on borne ses pixels (bombe de décompression). */
const MAX_PNG_PIXELS = 8_000_000;

export const PHOTO_SKIPPED_NOTE = 'Photo non reproduite (fichier illisible ou format non pris en charge).';

export interface InspectionPhotoRow {
  id: string;
  roomId: string | null;
  itemId: string | null;
  fileName: string;
  filePath: string;
  sizeBytes: number;
  caption: string | null;
}

export type PhotoReadResult =
  | { ok: true; image: DocumentImage; bytes: Buffer }
  | { ok: false; reason: 'MISSING' | 'UNREADABLE' | 'TOO_LARGE' | 'UNSUPPORTED' };

/**
 * Chemin du fichier d'une photo : dossier de CET état des lieux et de CETTE
 * agence, nom de fichier seul. `null` si le nom est inexploitable.
 */
export function resolveInspectionPhotoPath(tenantId: string, inspectionId: string, filePath: string): string | null {
  const name = path.basename(filePath.replace(/\\/g, '/'));
  if (!name || name === '.' || name === '..' || /[/\\\0]/.test(name)) return null;
  const dir = path.resolve(getUploadsRoot(env.UPLOADS_DIR), 'lease-inspections', tenantId, inspectionId);
  const absolute = path.resolve(dir, name);
  return absolute.startsWith(dir + path.sep) ? absolute : null;
}

/** Lit et valide une photo ; ne lève jamais. */
export async function readInspectionPhoto(
  tenantId: string,
  inspectionId: string,
  photo: Pick<InspectionPhotoRow, 'filePath'>
): Promise<PhotoReadResult> {
  const absolute = resolveInspectionPhotoPath(tenantId, inspectionId, photo.filePath);
  if (!absolute) return { ok: false, reason: 'UNREADABLE' };
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) return { ok: false, reason: 'MISSING' };
    if (stat.size > MAX_PHOTO_BYTES) return { ok: false, reason: 'TOO_LARGE' };
    const bytes = await fs.readFile(absolute);
    const format = detectImageFormat(bytes);
    if (!format) return { ok: false, reason: 'UNSUPPORTED' };
    const dimensions = readImageDimensions(bytes, format);
    if (!dimensions) return { ok: false, reason: 'UNREADABLE' };
    if (format === 'png' && dimensions.width * dimensions.height > MAX_PNG_PIXELS) {
      return { ok: false, reason: 'TOO_LARGE' };
    }
    return { ok: true, image: { bytes, format }, bytes };
  } catch (error) {
    return { ok: false, reason: (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'MISSING' : 'UNREADABLE' };
  }
}

// ===========================================================================
// Lecture en base
// ===========================================================================

const INSPECTION_PDF_SELECT = {
  id: true,
  tenantId: true,
  leaseId: true,
  type: true,
  status: true,
  inspectionDate: true,
  rooms: true,
  meters: true,
  keysCount: true,
  generalComment: true,
  tenantPresent: true,
  tenantSignatoryName: true,
  agentSignatoryName: true,
  deductions: true,
  finalizedAt: true,
  photos: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] as Array<{ createdAt?: 'asc'; id?: 'asc' }>,
    select: { id: true, roomId: true, itemId: true, fileName: true, filePath: true, sizeBytes: true, caption: true }
  },
  lease: {
    select: {
      lease_number: true,
      property: { select: { title: true, address: true } },
      primaryRenter: { select: { user: { select: { fullName: true } } } },
      coRenters: { select: { renterClient: { select: { user: { select: { fullName: true } } } } } },
      ownerClient: { select: { user: { select: { fullName: true } } } }
    }
  }
} as const;

/** L'état des lieux de l'agence avec son bail et ses photos ; `NotFoundError` sinon (même réponse qu'une autre agence). */
export async function loadInspectionForPdf(tenantId: string, inspectionId: string) {
  const row = await prisma.leaseInspection.findFirst({
    where: { id: inspectionId, tenantId, lease: { tenant_id: tenantId } },
    select: INSPECTION_PDF_SELECT
  });
  if (!row) throw new NotFoundError('État des lieux introuvable.');
  return row;
}

export type InspectionPdfRow = Awaited<ReturnType<typeof loadInspectionForPdf>>;

// ===========================================================================
// Empreinte du contenu figé (SG-R2)
// ===========================================================================

/** Sérialisation JSON à clés triées : deux lectures du même contenu donnent la même chaîne. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value instanceof Date ? value.toISOString() : (value ?? null));
}

/** Une photo retenue par le PDF, avec le résultat de sa lecture (mêmes octets pour le rendu et l'empreinte). */
export interface EmbeddedPhoto {
  photo: InspectionPdfRow['photos'][number];
  read: PhotoReadResult;
}

export interface EmbeddedPhotoSelection {
  selected: EmbeddedPhoto[];
  /** Photos enregistrées mais non reproduites (plafond de nombre ou de volume). */
  omitted: number;
}

/**
 * Les photos que le PDF reproduit : dans l'ordre, au plus `MAX_EMBEDDED_PHOTOS` et
 * `MAX_EMBEDDED_BYTES` octets. Le rendu ET l'empreinte partent de cette même sélection :
 * une photo que le PDF n'imprime pas ne peut pas invalider la signature.
 */
export async function selectEmbeddedPhotos(row: InspectionPdfRow): Promise<EmbeddedPhotoSelection> {
  const selected: EmbeddedPhoto[] = [];
  let embeddedBytes = 0;
  let omitted = 0;
  for (const photo of row.photos) {
    if (selected.length >= MAX_EMBEDDED_PHOTOS) {
      omitted += 1;
      continue;
    }
    const read = await readInspectionPhoto(row.tenantId, row.id, photo);
    if (read.ok && embeddedBytes + read.bytes.length > MAX_EMBEDDED_BYTES) {
      omitted += 1;
      continue;
    }
    if (read.ok) embeddedBytes += read.bytes.length;
    selected.push({ photo, read });
  }
  return { selected, omitted };
}

/**
 * SHA-256 du contenu que signent les parties : données de l'état des lieux
 * (pièces, compteurs, clés, retenues, présences, noms) ET contenu des photos
 * RETENUES par le PDF (mêmes plafonds que le rendu), avec le nombre de photos
 * omises, imprimé lui aussi. Un fichier absent compte comme une modification.
 */
export async function computeInspectionContentHash(
  row: InspectionPdfRow,
  selection?: EmbeddedPhotoSelection
): Promise<string> {
  const { selected, omitted } = selection ?? (await selectEmbeddedPhotos(row));
  const photos = selected.map(({ photo, read }) => ({
    id: photo.id,
    roomId: photo.roomId,
    itemId: photo.itemId,
    fileName: photo.fileName,
    caption: photo.caption,
    sizeBytes: photo.sizeBytes,
    digest: read.ok ? createHash('sha256').update(read.bytes).digest('hex') : `absent:${read.reason}`
  }));
  return createHash('sha256')
    .update(
      stableStringify({
        type: row.type,
        status: row.status,
        inspectionDate: row.inspectionDate,
        finalizedAt: row.finalizedAt,
        rooms: normalizeRooms(row.rooms),
        meters: row.meters,
        keysCount: row.keysCount,
        generalComment: row.generalComment,
        tenantPresent: row.tenantPresent,
        tenantSignatoryName: row.tenantSignatoryName,
        agentSignatoryName: row.agentSignatoryName,
        deductions: normalizeDeductions(row.deductions),
        photos,
        photosOmitted: omitted
      })
    )
    .digest('hex');
}

// ===========================================================================
// Modèle de document (tout ce qui sera imprimé)
// ===========================================================================

export interface PdfColumn {
  header: string;
  /** Part de la largeur utile (normalisée par tableau). */
  weight: number;
  align?: 'left' | 'right';
}

export interface PdfTableSection {
  kind: 'table';
  title: string;
  columns: PdfColumn[];
  rows: string[][];
  emptyText: string;
  /** Lignes de total imprimées sous le tableau. */
  totals?: Array<{ label: string; value: string }>;
}

export interface PdfTextSection {
  kind: 'text';
  title: string;
  text: string;
}

export interface PdfPhotoCard {
  label: string;
  caption: string | null;
  /** `null` : photo sautée, la mention `PHOTO_SKIPPED_NOTE` est imprimée à sa place. */
  image: DocumentImage | null;
}

export interface InspectionPdfModel {
  fileName: string;
  title: string;
  subtitle: string;
  info: Array<{ label: string; value: string }>;
  sections: Array<PdfTableSection | PdfTextSection>;
  photos: PdfPhotoCard[];
  /** Photos non reproduites faute de place dans le document (plafond de volume). */
  photosOmitted: number;
  signatures: Array<{ label: string; name: string }>;
  footer: string;
}

export interface InspectionPdfInput {
  type: 'ENTRY' | 'EXIT';
  inspectionDate: Date;
  finalizedAt: Date | null;
  tenantPresent: boolean;
  tenantSignatoryName: string | null;
  agentSignatoryName: string | null;
  keysCount: number | null;
  meters: InspectionMeters | null;
  generalComment: string | null;
  rooms: InspectionRoom[];
  deductions: Deduction[];
  lease: {
    number: string;
    propertyTitle: string | null;
    propertyAddress: string | null;
    renterNames: string[];
    ownerName: string | null;
  };
  photos: PdfPhotoCard[];
  photosOmitted?: number;
}

const dash = (value: string | number | null | undefined) =>
  value === null || value === undefined || String(value).trim() === '' ? '-' : String(value);

function roomTables(rooms: InspectionRoom[]): PdfTableSection[] {
  const showFurniture = rooms.some(room =>
    room.items.some(item => itemKind(item) === 'FURNITURE' || (item.replacementValue ?? null) !== null)
  );
  const columns: PdfColumn[] = showFurniture
    ? [
        { header: 'Élément', weight: 3 },
        { header: 'État', weight: 1.2 },
        { header: 'Qté', weight: 0.7, align: 'right' },
        { header: 'Valeur de remplacement', weight: 1.8, align: 'right' },
        { header: 'Commentaire', weight: 3.2 }
      ]
    : [
        { header: 'Élément', weight: 3 },
        { header: 'État', weight: 1.3 },
        { header: 'Commentaire', weight: 4.5 }
      ];
  return rooms.map(room => ({
    kind: 'table' as const,
    title: room.name,
    columns,
    emptyText: 'Aucun élément.',
    rows: room.items.map(item => {
      const base = [item.label, conditionLabel(item.condition)];
      const comment = item.comment?.trim() || '';
      if (!showFurniture) return [...base, comment];
      const quantity = itemKind(item) === 'FURNITURE' ? dash(item.quantity) : '';
      const value =
        item.replacementValue === null || item.replacementValue === undefined
          ? ''
          : `${formatInspectionMoney(item.replacementValue)}${itemKind(item) === 'FURNITURE' ? ' / unité' : ''}`;
      return [...base, quantity, value, comment];
    })
  }));
}

function deductionsTable(input: InspectionPdfInput): PdfTableSection {
  const labelOf = (deduction: Deduction): string => {
    const room = input.rooms.find(candidate => candidate.id === deduction.roomId);
    const item = input.rooms.flatMap(candidate => candidate.items).find(candidate => candidate.id === deduction.itemId);
    return [room?.name, item?.label].filter(Boolean).join(' - ');
  };
  const total = input.deductions.reduce((sum, deduction) => sum + (Number(deduction.amount) || 0), 0);
  return {
    kind: 'table',
    title: 'Retenues proposées sur le dépôt de garantie',
    columns: [
      { header: 'Libellé', weight: 4 },
      { header: 'Origine', weight: 1.4 },
      { header: 'Pièce et élément', weight: 3 },
      { header: 'Montant', weight: 1.8, align: 'right' }
    ],
    emptyText: 'Aucune retenue.',
    rows: input.deductions.map(deduction => [
      deduction.label,
      DEDUCTION_SOURCE_LABELS[deduction.source ?? 'MANUAL'] ?? '',
      labelOf(deduction),
      formatInspectionMoney(Number(deduction.amount) || 0)
    ]),
    totals: input.deductions.length > 0 ? [{ label: 'Total des retenues', value: formatInspectionMoney(total) }] : []
  };
}

/** Construit le modèle imprimé : aucun accès disque ni base. */
export function buildInspectionPdfModel(input: InspectionPdfInput): InspectionPdfModel {
  const isExit = input.type === 'EXIT';
  const title = isExit ? 'État des lieux de sortie' : "État des lieux d'entrée";
  const date = formatInspectionDate(input.inspectionDate);
  const { lease } = input;

  const info: InspectionPdfModel['info'] = [
    { label: 'Bail', value: `N° ${dash(lease.number)}` },
    { label: 'Bien', value: dash([lease.propertyTitle, lease.propertyAddress].filter(Boolean).join(' - ')) },
    { label: 'Locataire(s)', value: dash(lease.renterNames.filter(Boolean).join(', ')) },
    { label: 'Bailleur', value: dash(lease.ownerName) },
    { label: 'Type', value: isExit ? 'Sortie' : 'Entrée' },
    { label: 'Date', value: date },
    { label: 'Locataire présent', value: input.tenantPresent ? 'Oui' : 'Non' },
    { label: 'Nombre de clés remises', value: dash(input.keysCount) }
  ];
  if (input.finalizedAt) info.push({ label: 'Finalisé le', value: formatInspectionDate(input.finalizedAt) });

  const meters = input.meters ?? {};
  const sections: InspectionPdfModel['sections'] = [
    {
      kind: 'table',
      title: 'Compteurs',
      columns: [
        { header: 'Compteur', weight: 2 },
        { header: 'Index relevé', weight: 4 }
      ],
      emptyText: '',
      rows: [
        ['Électricité', dash(meters.electricity)],
        ['Eau', dash(meters.water)],
        ['Gaz', dash(meters.gas)]
      ]
    },
    ...roomTables(input.rooms)
  ];
  if (isExit) sections.push(deductionsTable(input));
  sections.push({
    kind: 'text',
    title: 'Observations générales',
    text: input.generalComment?.trim() || 'Aucune observation.'
  });

  return {
    fileName: `etat-des-lieux-${isExit ? 'sortie' : 'entree'}-${date.split('/').reverse().join('-')}.pdf`,
    title,
    subtitle: `Bail N° ${dash(lease.number)} - réalisé le ${date}`,
    info,
    sections,
    photos: input.photos,
    photosOmitted: input.photosOmitted ?? 0,
    signatures: [
      {
        label: input.tenantPresent ? 'Le locataire' : 'Le locataire (absent)',
        name: input.tenantSignatoryName?.trim() || ''
      },
      { label: "Pour l'agence", name: input.agentSignatoryName?.trim() || '' }
    ],
    footer: `${title} - bail ${dash(lease.number)}`
  };
}

// ===========================================================================
// Rendu pdf-lib
// ===========================================================================

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const FOOTER_SPACE = 40;
const LINE_HEIGHT = 10;
const GREY = rgb(0.35, 0.35, 0.35);
const RULE = rgb(0.75, 0.75, 0.75);
const MAX_CELL_LINES = 8;

/** Lignes qui tiennent dans `maxWidth` (mots entiers, coupe dure d'un mot trop long), au plus `maxLines`. */
function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = Infinity): string[] {
  const words = sanitizeForPdf(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  const fitted = lines.map(line => truncate(line, font, size, maxWidth));
  if (fitted.length <= maxLines) return fitted;
  const kept = fitted.slice(0, maxLines);
  kept[maxLines - 1] = truncate(`${kept[maxLines - 1]}...`, font, size, maxWidth);
  return kept;
}

interface Cursor {
  page: PDFPage;
  y: number;
}

/**
 * Dessine le modèle : en-tête de l'agence, informations, tableaux paginés,
 * observations, photos, zones de signature, pied de page numéroté.
 */
export async function renderInspectionPdf(model: InspectionPdfModel, branding: DocumentBranding): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(sanitizeForPdf(model.title));
  pdfDoc.setLanguage('fr-FR');
  const { regular, bold } = await fontsOf(pdfDoc);
  const contentWidth = PAGE_WIDTH - 2 * MARGIN;

  const first = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const cursor: Cursor = {
    page: first,
    y: await drawDocumentHeader(pdfDoc, first, branding, { title: model.title, subtitle: model.subtitle })
  };

  const newPage = () => {
    cursor.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursor.y = PAGE_HEIGHT - MARGIN;
    cursor.page.drawText(truncate(`${model.title} (suite)`, bold, 10, contentWidth), {
      x: MARGIN,
      y: cursor.y,
      size: 10,
      font: bold
    });
    cursor.y -= 22;
  };
  const ensure = (height: number) => {
    if (cursor.y - height < MARGIN + FOOTER_SPACE) newPage();
  };
  const drawText = (text: string, x: number, size: number, font: PDFFont, maxWidth: number, color = rgb(0, 0, 0)) => {
    cursor.page.drawText(truncate(text, font, size, maxWidth), { x, y: cursor.y, size, font, color });
  };

  // Informations générales : libellé / valeur (la valeur peut passer sur plusieurs lignes).
  for (const entry of model.info) {
    const lines = wrapLines(entry.value, regular, 9, contentWidth - 140, 3);
    ensure(lines.length * 12 + 2);
    drawText(`${entry.label} :`, MARGIN, 9, bold, 130);
    for (const line of lines) {
      cursor.page.drawText(line, { x: MARGIN + 140, y: cursor.y, size: 9, font: regular });
      cursor.y -= 12;
    }
  }

  for (const section of model.sections) {
    cursor.y -= 10;
    if (section.kind === 'text') {
      const lines = wrapLines(section.text, regular, 9, contentWidth);
      ensure(40);
      drawText(section.title, MARGIN, 10.5, bold, contentWidth);
      cursor.y -= 14;
      for (const line of lines) {
        ensure(12);
        cursor.page.drawText(line, { x: MARGIN, y: cursor.y, size: 9, font: regular });
        cursor.y -= 12;
      }
      continue;
    }

    ensure(60);
    drawText(section.title, MARGIN, 10.5, bold, contentWidth);
    cursor.y -= 14;

    const totalWeight = section.columns.reduce((sum, column) => sum + column.weight, 0) || 1;
    const widths = section.columns.map(column => (column.weight / totalWeight) * contentWidth);
    const drawRow = (font: PDFFont, heightLines: number, lines: string[][]) => {
      let x = MARGIN;
      section.columns.forEach((column, index) => {
        const width = widths[index];
        lines[index]?.forEach((line, lineIndex) => {
          const textWidth = font.widthOfTextAtSize(line, 8);
          const drawX = column.align === 'right' ? x + width - 2 - textWidth : x + 2;
          cursor.page.drawText(line, { x: drawX, y: cursor.y - lineIndex * LINE_HEIGHT, size: 8, font });
        });
        x += width;
      });
      cursor.y -= heightLines * LINE_HEIGHT + 3;
    };
    const drawHeader = () => {
      ensure(30);
      drawRow(
        bold,
        1,
        section.columns.map((column, index) => [truncate(column.header, bold, 8, widths[index] - 4)])
      );
      cursor.page.drawLine({
        start: { x: MARGIN, y: cursor.y + 6 },
        end: { x: MARGIN + contentWidth, y: cursor.y + 6 },
        thickness: 0.5,
        color: RULE
      });
      cursor.y -= 4;
    };
    drawHeader();

    if (section.rows.length === 0) {
      if (section.emptyText) drawText(section.emptyText, MARGIN + 2, 8.5, regular, contentWidth, GREY);
      cursor.y -= 12;
    }
    for (const cells of section.rows) {
      const lines = cells.map((cell, index) => wrapLines(cell, regular, 8, widths[index] - 4, MAX_CELL_LINES));
      const heightLines = Math.max(1, ...lines.map(cellLines => cellLines.length));
      if (cursor.y - (heightLines * LINE_HEIGHT + 6) < MARGIN + FOOTER_SPACE) {
        newPage();
        drawHeader();
      }
      drawRow(regular, heightLines, lines);
      cursor.page.drawLine({
        start: { x: MARGIN, y: cursor.y + 8 },
        end: { x: MARGIN + contentWidth, y: cursor.y + 8 },
        thickness: 0.25,
        color: rgb(0.88, 0.88, 0.88)
      });
    }

    for (const total of section.totals ?? []) {
      ensure(16);
      cursor.y -= 4;
      drawText(`${total.label} :`, MARGIN, 9, bold, contentWidth - 140);
      const value = truncate(total.value, regular, 9, 130);
      cursor.page.drawText(value, {
        x: MARGIN + contentWidth - regular.widthOfTextAtSize(value, 9),
        y: cursor.y,
        size: 9,
        font: regular
      });
      cursor.y -= 12;
    }
  }

  await drawPhotos(pdfDoc, model, cursor, { regular, bold, contentWidth, ensure, newPage });

  // Zones de signature : deux cadres côte à côte (la signature électronique est apposée par le noyau).
  const boxHeight = 70;
  cursor.y -= 16;
  ensure(boxHeight + 30);
  const boxWidth = (contentWidth - 20) / 2;
  model.signatures.forEach((signature, index) => {
    const x = MARGIN + index * (boxWidth + 20);
    cursor.page.drawText(truncate(signature.label, bold, 9, boxWidth), { x, y: cursor.y, size: 9, font: bold });
    cursor.page.drawRectangle({
      x,
      y: cursor.y - boxHeight - 6,
      width: boxWidth,
      height: boxHeight,
      borderColor: RULE,
      borderWidth: 0.6
    });
    cursor.page.drawText(truncate(signature.name || 'Nom et signature', regular, 8, boxWidth - 8), {
      x: x + 4,
      y: cursor.y - boxHeight - 2,
      size: 8,
      font: regular,
      color: GREY
    });
  });

  const pages = pdfDoc.getPages();
  pages.forEach((current, index) => {
    current.drawText(truncate(`${model.footer} - page ${index + 1}/${pages.length}`, regular, 7.5, contentWidth), {
      x: MARGIN,
      y: MARGIN - 14,
      size: 7.5,
      font: regular,
      color: GREY
    });
  });

  return Buffer.from(await pdfDoc.save());
}

/** Photos en grille de trois ; une photo sautée laisse un cadre avec la mention. */
async function drawPhotos(
  pdfDoc: PDFDocument,
  model: InspectionPdfModel,
  cursor: Cursor,
  helpers: {
    regular: PDFFont;
    bold: PDFFont;
    contentWidth: number;
    ensure: (height: number) => void;
    newPage: () => void;
  }
): Promise<void> {
  if (model.photos.length === 0 && model.photosOmitted === 0) return;
  const { regular, bold, contentWidth, ensure } = helpers;
  const gap = 10;
  const cellWidth = (contentWidth - 2 * gap) / 3;
  const imageHeight = 110;
  const captionLines = 3;
  const cellHeight = imageHeight + 8 + captionLines * 9;

  cursor.y -= 10;
  ensure(cellHeight + 30);
  cursor.page.drawText(truncate('Photos', bold, 10.5, contentWidth), {
    x: MARGIN,
    y: cursor.y,
    size: 10.5,
    font: bold
  });
  cursor.y -= 12;

  for (let index = 0; index < model.photos.length; index += 3) {
    ensure(cellHeight + 6);
    const rowTop = cursor.y;
    for (let column = 0; column < 3; column += 1) {
      const card = model.photos[index + column];
      if (!card) break;
      const x = MARGIN + column * (cellWidth + gap);
      const boxBottom = rowTop - imageHeight;
      const embedded = await embedImage(pdfDoc, card.image);
      if (embedded) {
        const size = fitInBox(embedded.width, embedded.height, cellWidth, imageHeight);
        cursor.page.drawImage(embedded, {
          x: x + (cellWidth - size.width) / 2,
          y: boxBottom + (imageHeight - size.height) / 2,
          ...size
        });
      } else {
        cursor.page.drawRectangle({
          x,
          y: boxBottom,
          width: cellWidth,
          height: imageHeight,
          borderColor: RULE,
          borderWidth: 0.6
        });
        wrapLines(PHOTO_SKIPPED_NOTE, regular, 7.5, cellWidth - 12, 4).forEach((line, lineIndex) => {
          cursor.page.drawText(line, {
            x: x + 6,
            y: rowTop - 16 - lineIndex * 9,
            size: 7.5,
            font: regular,
            color: GREY
          });
        });
      }
      const text = [card.label, card.caption].filter(Boolean).join(' - ');
      wrapLines(text, regular, 7.5, cellWidth, captionLines).forEach((line, lineIndex) => {
        cursor.page.drawText(line, { x, y: boxBottom - 10 - lineIndex * 9, size: 7.5, font: regular });
      });
    }
    cursor.y = rowTop - cellHeight - 6;
  }

  if (model.photosOmitted > 0) {
    ensure(14);
    cursor.page.drawText(
      truncate(
        `${model.photosOmitted} autre(s) photo(s) enregistrée(s) ne sont pas reproduites ici (volume du document).`,
        regular,
        8,
        contentWidth
      ),
      { x: MARGIN, y: cursor.y, size: 8, font: regular, color: GREY }
    );
    cursor.y -= 12;
  }
}

// ===========================================================================
// Assemblage
// ===========================================================================

const fullName = (user: { fullName: string | null } | null | undefined) => user?.fullName?.trim() || '';

/** Cartes photo : budget de volume respecté, photo illisible sautée (image `null`). */
function buildPhotoCards(
  row: InspectionPdfRow,
  selection: EmbeddedPhotoSelection
): { cards: PdfPhotoCard[]; omitted: number } {
  const rooms = normalizeRooms(row.rooms);
  const roomName = (id: string | null) => rooms.find(room => room.id === id)?.name ?? null;
  const itemLabel = (id: string | null) =>
    rooms.flatMap(room => room.items).find(item => item.id === id)?.label ?? null;

  const cards: PdfPhotoCard[] = [];
  for (const { photo, read } of selection.selected) {
    const label =
      [roomName(photo.roomId), itemLabel(photo.itemId)].filter(Boolean).join(' / ') || `Photo ${cards.length + 1}`;
    cards.push({ label, caption: photo.caption?.trim() || null, image: read.ok ? read.image : null });
  }
  return { cards, omitted: selection.omitted };
}

/** Rend le PDF d'un état des lieux de l'agence (finalisé ou non : le refus du brouillon est l'affaire de l'appelant). */
export async function buildInspectionPdf(
  tenantId: string,
  inspectionId: string
): Promise<{ buffer: Buffer; fileName: string; contentHash: string }> {
  const row = await loadInspectionForPdf(tenantId, inspectionId);
  const [branding, selection] = await Promise.all([resolveDocumentBranding(tenantId, null), selectEmbeddedPhotos(row)]);
  const photos = buildPhotoCards(row, selection);
  // Empreinte tirée des MÊMES données et des MÊMES octets de photo que le rendu (jamais une seconde lecture).
  const contentHash = await computeInspectionContentHash(row, selection);
  const model = buildInspectionPdfModel({
    type: row.type,
    inspectionDate: row.inspectionDate,
    finalizedAt: row.finalizedAt,
    tenantPresent: row.tenantPresent,
    tenantSignatoryName: row.tenantSignatoryName,
    agentSignatoryName: row.agentSignatoryName,
    keysCount: row.keysCount,
    meters:
      row.meters && typeof row.meters === 'object' && !Array.isArray(row.meters)
        ? (row.meters as InspectionMeters)
        : null,
    generalComment: row.generalComment,
    rooms: normalizeRooms(row.rooms),
    deductions: normalizeDeductions(row.deductions),
    lease: {
      number: row.lease.lease_number,
      propertyTitle: row.lease.property?.title ?? null,
      propertyAddress: row.lease.property?.address ?? null,
      renterNames: [
        fullName(row.lease.primaryRenter?.user),
        ...row.lease.coRenters.map(co => fullName(co.renterClient?.user))
      ].filter(Boolean),
      ownerName: fullName(row.lease.ownerClient?.user) || null
    },
    photos: photos.cards,
    photosOmitted: photos.omitted
  });
  return { buffer: await renderInspectionPdf(model, branding), fileName: model.fileName, contentHash };
}
