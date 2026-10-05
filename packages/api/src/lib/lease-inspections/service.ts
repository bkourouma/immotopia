import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { LeaseInspectionStatus, LeaseInspectionType, Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';
import { getUploadsRoot } from '../../utils/project-root';
import { badRequest, conflict, notFound } from '../errors';
import { AppError, ErrorCode } from '../../middleware/error-middleware';
import {
  CONDITIONS,
  DEDUCTION_SOURCES,
  ITEM_KINDS,
  MAX_QUANTITY,
  MAX_REPLACEMENT_VALUE,
  blankRoomsFrom,
  compareInspections,
  compareSummary,
  countItems,
  findRemovedEntryItems,
  findUnevaluatedItems,
  freezeEntryFields,
  normalizeDeductions,
  normalizeItemQuantity,
  normalizeRooms,
  templateRooms,
  type CompareRow,
  type CompareSummary,
  type Deduction,
  type InspectionMeters,
  type InspectionRoom
} from './inventory';

// Forme des colonnes JSON et règles pures : `./inventory` (spec 040, volet
// meublés). Réexportées ici pour les appelants historiques.
export {
  blankRoomsFrom,
  compareInspections,
  compareSummary,
  defaultRooms,
  findRemovedEntryItems,
  findUnevaluatedItems,
  freezeEntryFields,
  furnishedRooms,
  normalizeDeductions,
  normalizeRooms,
  parseMeterReading
} from './inventory';
export type {
  CompareRow,
  CompareSummary,
  Condition,
  Deduction,
  DeductionSource,
  InspectionItem,
  InspectionMeters,
  InspectionRoom,
  InspectionTemplate,
  ItemKind,
  UnevaluatedItem
} from './inventory';

/**
 * États des lieux d'entrée et de sortie — lot 5 (section B) de la gestion
 * locative.
 *
 * `rooms` et `deductions` sont stockés en JSON (voir le commentaire du modèle
 * `LeaseInspection` dans le schéma) : les identifiants de pièce et d'élément
 * sont fournis par le client et restent stables d'un état des lieux à
 * l'autre, ce qui permet à la fois la reprise entrée → sortie et la
 * comparaison des deux.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InspectionPhotoDto {
  id: string;
  roomId: string | null;
  itemId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  createdAt: string;
}

export interface LeaseInspectionDto {
  id: string;
  type: LeaseInspectionType;
  status: LeaseInspectionStatus;
  inspectionDate: string;
  rooms: InspectionRoom[];
  meters: InspectionMeters | null;
  keysCount: number | null;
  generalComment: string | null;
  tenantPresent: boolean;
  tenantSignatoryName: string | null;
  agentSignatoryName: string | null;
  deductions: Deduction[];
  finalizedAt: string | null;
  photos: InspectionPhotoDto[];
}

// ---------------------------------------------------------------------------
// Lecture des colonnes JSON — toujours écrites par nous, jamais par l'usager
// directement, mais on reste défensif à la lecture.
// ---------------------------------------------------------------------------

function toMeters(value: unknown): InspectionMeters | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as InspectionMeters) : null;
}

type InspectionRow = Prisma.LeaseInspectionGetPayload<{ include: { photos: true } }>;
type PhotoRow = InspectionRow['photos'][number];

function toPhotoDto(photo: PhotoRow): InspectionPhotoDto {
  return {
    id: photo.id,
    roomId: photo.roomId,
    itemId: photo.itemId,
    fileName: photo.fileName,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    caption: photo.caption,
    createdAt: photo.createdAt.toISOString()
  };
}

function toDto(row: InspectionRow): LeaseInspectionDto {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    inspectionDate: row.inspectionDate.toISOString(),
    rooms: normalizeRooms(row.rooms),
    meters: toMeters(row.meters),
    keysCount: row.keysCount,
    generalComment: row.generalComment,
    tenantPresent: row.tenantPresent,
    tenantSignatoryName: row.tenantSignatoryName,
    agentSignatoryName: row.agentSignatoryName,
    deductions: normalizeDeductions(row.deductions),
    finalizedAt: row.finalizedAt ? row.finalizedAt.toISOString() : null,
    photos: row.photos.map(toPhotoDto)
  };
}

const INSPECTION_INCLUDE = { photos: { orderBy: { createdAt: 'asc' as const } } };

// ---------------------------------------------------------------------------
// Dates — même convention que `resolvePaymentDate` / `payoutDate` : midi UTC,
// pour ne pas glisser de jour selon le fuseau du serveur.
// ---------------------------------------------------------------------------

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw badRequest("Cette date n'existe pas.");
  }
  return date;
}

// ---------------------------------------------------------------------------
// Gardes tenant / bail
// ---------------------------------------------------------------------------

async function assertLeaseForTenant(tenantId: string, leaseId: string): Promise<void> {
  const lease = await prisma.rentalLease.findFirst({
    where: { id: leaseId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!lease) throw notFound('Bail introuvable.');
}

async function getInspectionRow(tenantId: string, leaseId: string, inspectionId: string): Promise<InspectionRow> {
  const row = await prisma.leaseInspection.findFirst({
    where: { id: inspectionId, leaseId, tenantId },
    include: INSPECTION_INCLUDE
  });
  if (!row) throw notFound('État des lieux introuvable.');
  return row;
}

// ---------------------------------------------------------------------------
// Consultation
// ---------------------------------------------------------------------------

export async function listInspections(tenantId: string, leaseId: string): Promise<LeaseInspectionDto[]> {
  await assertLeaseForTenant(tenantId, leaseId);
  const rows = await prisma.leaseInspection.findMany({
    where: { leaseId, tenantId },
    include: INSPECTION_INCLUDE
  });
  return rows
    .slice()
    .sort((a, b) => (a.type === b.type ? 0 : a.type === LeaseInspectionType.ENTRY ? -1 : 1))
    .map(toDto);
}

export async function compareInspectionsForLease(
  tenantId: string,
  leaseId: string
): Promise<{
  entry: LeaseInspectionDto | null;
  exit: LeaseInspectionDto | null;
  rows: CompareRow[];
  summary: CompareSummary;
}> {
  await assertLeaseForTenant(tenantId, leaseId);
  const rows = await prisma.leaseInspection.findMany({
    where: { leaseId, tenantId },
    include: INSPECTION_INCLUDE
  });
  const entryRow = rows.find(row => row.type === LeaseInspectionType.ENTRY);
  const exitRow = rows.find(row => row.type === LeaseInspectionType.EXIT);
  const entry = entryRow ? toDto(entryRow) : null;
  const exit = exitRow ? toDto(exitRow) : null;
  const compared = compareInspections(entry, exit);
  return { entry, exit, rows: compared, summary: compareSummary(entry, exit, compared) };
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

const createInspectionSchema = z.object({
  type: z.enum(['ENTRY', 'EXIT']),
  inspectionDate: dateOnlySchema,
  // Absent = STANDARD : un appelant qui ignore le paramètre garde le
  // comportement historique (bâti seulement).
  template: z
    .enum(['STANDARD', 'FURNISHED'])
    .optional()
    .transform(v => v ?? 'STANDARD')
});

export async function createInspection(
  tenantId: string,
  leaseId: string,
  body: unknown,
  userId: string | undefined
): Promise<LeaseInspectionDto> {
  const input = createInspectionSchema.parse(body);
  await assertLeaseForTenant(tenantId, leaseId);

  const existing = await prisma.leaseInspection.findFirst({
    where: { leaseId, tenantId, type: input.type },
    select: { id: true }
  });
  if (existing) {
    throw conflict(
      input.type === 'ENTRY'
        ? "Un état des lieux d'entrée existe déjà pour ce bail."
        : 'Un état des lieux de sortie existe déjà pour ce bail.'
    );
  }

  let rooms: InspectionRoom[];
  if (input.type === 'EXIT') {
    const entry = await prisma.leaseInspection.findFirst({
      where: { leaseId, tenantId, type: LeaseInspectionType.ENTRY },
      select: { rooms: true }
    });
    // Une entrée existe : ses pièces sont reprises et `template` est ignoré.
    rooms = entry
      ? blankRoomsFrom(normalizeRooms(entry.rooms))
      : templateRooms(input.template, { withQuantities: false });
  } else {
    rooms = templateRooms(input.template, { withQuantities: true });
  }

  const row = await prisma.leaseInspection.create({
    data: {
      tenantId,
      leaseId,
      type: input.type,
      inspectionDate: parseDateOnly(input.inspectionDate),
      rooms: rooms as unknown as Prisma.InputJsonValue,
      deductions: [] as unknown as Prisma.InputJsonValue,
      createdByUserId: userId ?? null
    },
    include: INSPECTION_INCLUDE
  });

  return toDto(row);
}

// ---------------------------------------------------------------------------
// Mise à jour — brouillons seulement
// ---------------------------------------------------------------------------

const conditionSchema = z.enum(CONDITIONS);

const itemSchema = z
  .object({
    id: z.string().trim().min(1, "Identifiant d'élément requis."),
    label: z.string().trim().min(1, 'Libellé requis.'),
    condition: conditionSchema.nullable(),
    comment: z.string().trim().max(2000).nullable(),
    // Champs du volet meublés, facultatifs : un document ancien (ou un client
    // qui les ignore) reste accepté, en éléments de bâti.
    kind: z
      .enum(ITEM_KINDS)
      .optional()
      .transform(v => v ?? 'FIXTURE'),
    quantity: z
      .number()
      .int()
      .min(0)
      .max(MAX_QUANTITY)
      .nullable()
      .optional()
      .transform(v => v ?? null),
    replacementValue: z
      .number()
      .int()
      .min(0)
      .max(MAX_REPLACEMENT_VALUE)
      .nullable()
      .optional()
      .transform(v => v ?? null)
  })
  .superRefine((item, ctx) => {
    if (item.kind === 'FIXTURE' && item.quantity !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quantity'],
        message: 'Seul un élément de mobilier porte une quantité.'
      });
    }
  })
  // R3 : un élément de mobilier manquant compte 0, quelle que soit la quantité reçue.
  .transform(item => normalizeItemQuantity(item));

const roomSchema = z.object({
  id: z.string().trim().min(1, 'Identifiant de pièce requis.'),
  name: z.string().trim().min(1, 'Nom de pièce requis.'),
  items: z.array(itemSchema)
});

const deductionSchema = z.object({
  id: z.string().trim().min(1, 'Identifiant de retenue requis.'),
  label: z.string().trim().min(1, 'Libellé de retenue requis.'),
  amount: z.number().nonnegative('Le montant de la retenue doit être positif.'),
  roomId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform(v => v ?? null),
  itemId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform(v => v ?? null),
  source: z
    .enum(DEDUCTION_SOURCES)
    .optional()
    .transform(v => v ?? 'MANUAL'),
  proposedAmount: z
    .number()
    .nonnegative()
    .nullable()
    .optional()
    .transform(v => v ?? null)
});

const metersSchema = z
  .object({
    electricity: z
      .string()
      .trim()
      .max(120)
      .nullable()
      .optional()
      .transform(v => v || null),
    water: z
      .string()
      .trim()
      .max(120)
      .nullable()
      .optional()
      .transform(v => v || null),
    gas: z
      .string()
      .trim()
      .max(120)
      .nullable()
      .optional()
      .transform(v => v || null)
  })
  .nullable();

const updateInspectionSchema = z
  .object({
    inspectionDate: dateOnlySchema,
    rooms: z.array(roomSchema),
    meters: metersSchema,
    keysCount: z.number().int().nonnegative().nullable(),
    generalComment: z
      .string()
      .trim()
      .max(4000)
      .nullable()
      .transform(v => v || null),
    tenantPresent: z.boolean(),
    tenantSignatoryName: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .transform(v => v || null),
    agentSignatoryName: z
      .string()
      .trim()
      .max(200)
      .nullable()
      .transform(v => v || null),
    deductions: z.array(deductionSchema)
  })
  .superRefine((value, ctx) => {
    const roomIds = value.rooms.map(room => room.id);
    if (new Set(roomIds).size !== roomIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rooms'],
        message: 'Les identifiants de pièce doivent être uniques.'
      });
    }
    const itemIds = value.rooms.flatMap(room => room.items.map(item => item.id));
    if (new Set(itemIds).size !== itemIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rooms'],
        message: "Les identifiants d'élément doivent être uniques."
      });
    }
  });

/**
 * R4 — sortie face à une entrée **finalisée** : un élément repris de l'entrée
 * ne peut pas être retiré (on le marque « Manquant ») et ses libellé, nature
 * et valeur de remplacement sont ceux de l'entrée. Une entrée en brouillon ou
 * absente ne fait pas foi : aucune contrainte.
 */
async function guardExitAgainstEntry(
  tenantId: string,
  leaseId: string,
  savedExitRooms: InspectionRoom[],
  incomingRooms: InspectionRoom[]
): Promise<InspectionRoom[]> {
  const entry = await prisma.leaseInspection.findFirst({
    where: { leaseId, tenantId, type: LeaseInspectionType.ENTRY },
    select: { rooms: true, status: true }
  });
  if (!entry || entry.status !== LeaseInspectionStatus.FINALIZED) return incomingRooms;

  const entryRooms = normalizeRooms(entry.rooms);
  const removedItems = findRemovedEntryItems(entryRooms, savedExitRooms, incomingRooms);
  if (removedItems.length > 0) {
    throw new AppError(
      "Un élément repris de l'état des lieux d'entrée ne peut pas être retiré de la sortie : indiquez « Manquant ».",
      400,
      ErrorCode.BAD_REQUEST,
      undefined,
      { removedItems }
    );
  }
  return freezeEntryFields(incomingRooms, entryRooms);
}

export async function updateInspection(
  tenantId: string,
  leaseId: string,
  inspectionId: string,
  body: unknown
): Promise<LeaseInspectionDto> {
  await assertLeaseForTenant(tenantId, leaseId);
  const existing = await getInspectionRow(tenantId, leaseId, inspectionId);
  if (existing.status === LeaseInspectionStatus.FINALIZED) {
    throw conflict('Cet état des lieux est finalisé : il ne peut plus être modifié.');
  }

  const input = updateInspectionSchema.parse(body);
  const rooms =
    existing.type === LeaseInspectionType.EXIT
      ? await guardExitAgainstEntry(tenantId, leaseId, normalizeRooms(existing.rooms), input.rooms)
      : input.rooms;

  const row = await prisma.leaseInspection.update({
    where: { id: inspectionId, tenantId },
    data: {
      inspectionDate: parseDateOnly(input.inspectionDate),
      rooms: rooms as unknown as Prisma.InputJsonValue,
      // Colonne optionnelle : `Prisma.DbNull` écrit un NULL SQL, un `null` nu
      // n'est pas accepté par le client pour une colonne Json (voir
      // audit-service.ts).
      meters: (input.meters ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue,
      keysCount: input.keysCount,
      generalComment: input.generalComment,
      tenantPresent: input.tenantPresent,
      tenantSignatoryName: input.tenantSignatoryName,
      agentSignatoryName: input.agentSignatoryName,
      deductions: input.deductions as unknown as Prisma.InputJsonValue
    },
    include: INSPECTION_INCLUDE
  });

  return toDto(row);
}

// ---------------------------------------------------------------------------
// Finalisation
// ---------------------------------------------------------------------------

export async function finalizeInspection(
  tenantId: string,
  leaseId: string,
  inspectionId: string,
  userId: string | undefined
): Promise<LeaseInspectionDto> {
  await assertLeaseForTenant(tenantId, leaseId);
  const existing = await getInspectionRow(tenantId, leaseId, inspectionId);
  if (existing.status === LeaseInspectionStatus.FINALIZED) {
    throw conflict('Cet état des lieux est déjà finalisé.');
  }

  if (!existing.agentSignatoryName?.trim()) {
    throw badRequest("Le nom du signataire pour l'agence est requis pour finaliser.");
  }
  if (existing.tenantPresent && !existing.tenantSignatoryName?.trim()) {
    throw badRequest('Le nom du signataire locataire est requis : le locataire était présent.');
  }
  const rooms = normalizeRooms(existing.rooms);
  if (countItems(rooms) === 0) {
    throw badRequest('Au moins un élément doit avoir un état renseigné avant de finaliser.');
  }
  // R5 : chaque élément est évalué (état ; quantité pour le mobilier non manquant).
  const unevaluatedItems = findUnevaluatedItems(rooms);
  if (unevaluatedItems.length > 0) {
    throw new AppError(
      'Tous les éléments doivent être évalués avant de finaliser.',
      400,
      ErrorCode.BAD_REQUEST,
      undefined,
      { unevaluatedItems }
    );
  }

  const row = await prisma.leaseInspection.update({
    where: { id: inspectionId, tenantId },
    data: { status: LeaseInspectionStatus.FINALIZED, finalizedAt: new Date(), finalizedByUserId: userId ?? null },
    include: INSPECTION_INCLUDE
  });

  return toDto(row);
}

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    logger.warn('Photo état des lieux introuvable au nettoyage', {
      filePath,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function deleteInspection(tenantId: string, leaseId: string, inspectionId: string): Promise<void> {
  await assertLeaseForTenant(tenantId, leaseId);
  const existing = await getInspectionRow(tenantId, leaseId, inspectionId);
  if (existing.status === LeaseInspectionStatus.FINALIZED) {
    throw conflict('Cet état des lieux est finalisé : il ne peut plus être supprimé.');
  }

  await Promise.all(existing.photos.map(photo => safeUnlink(photo.filePath)));
  // `onDelete: Cascade` sur LeaseInspectionPhoto.inspection supprime les
  // lignes de photos ; seuls les fichiers sur disque doivent l'être à la main.
  await prisma.leaseInspection.delete({ where: { id: inspectionId, tenantId } });
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

const ALLOWED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo

const photoFieldsSchema = z.object({
  roomId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform(v => v || null),
  itemId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform(v => v || null),
  caption: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform(v => v || null)
});

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return '';
  }
}

/** Coupe séparateurs de chemin et caractères dangereux — le nom reste affiché, jamais utilisé comme chemin. */
function sanitizeDisplayName(fileName: string): string {
  return fileName
    .replace(/[/\\]/g, '')
    .replace(/\.\./g, '')
    .replace(/[<>:"|?*]/g, '')
    .trim();
}

export async function addInspectionPhoto(
  tenantId: string,
  leaseId: string,
  inspectionId: string,
  file: Express.Multer.File | undefined,
  fields: unknown,
  userId: string | undefined
): Promise<InspectionPhotoDto> {
  await assertLeaseForTenant(tenantId, leaseId);
  const inspection = await getInspectionRow(tenantId, leaseId, inspectionId);
  if (inspection.status === LeaseInspectionStatus.FINALIZED) {
    throw conflict('Cet état des lieux est finalisé : il ne peut plus recevoir de photos.');
  }

  if (!file) {
    throw badRequest('Un fichier est requis.');
  }
  if (!file.mimetype || !ALLOWED_PHOTO_MIME_TYPES.includes(file.mimetype)) {
    throw badRequest('Type de fichier non autorisé. Formats acceptés : JPEG, PNG, WebP.');
  }
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    throw badRequest('Fichier trop volumineux : 10 Mo maximum.');
  }

  const parsedFields = photoFieldsSchema.parse(fields ?? {});

  const uploadDir = path.join(getUploadsRoot(env.UPLOADS_DIR), 'lease-inspections', tenantId, inspectionId);
  await fs.mkdir(uploadDir, { recursive: true });

  const extension = path.extname(file.originalname).toLowerCase() || extensionForMimeType(file.mimetype);
  const storedFileName = `${randomUUID()}${extension}`;
  const filePath = path.join(uploadDir, storedFileName);
  await fs.writeFile(filePath, file.buffer);

  const displayName = sanitizeDisplayName(file.originalname) || storedFileName;

  const photo = await prisma.leaseInspectionPhoto.create({
    data: {
      tenantId,
      inspectionId,
      roomId: parsedFields.roomId,
      itemId: parsedFields.itemId,
      fileName: displayName,
      filePath,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      caption: parsedFields.caption,
      uploadedByUserId: userId ?? null
    }
  });

  return toPhotoDto(photo);
}

export interface InspectionPhotoFile {
  filePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function getInspectionPhotoFile(
  tenantId: string,
  leaseId: string,
  inspectionId: string,
  photoId: string
): Promise<InspectionPhotoFile> {
  await assertLeaseForTenant(tenantId, leaseId);
  // Vérifie que l'état des lieux appartient bien à ce bail / cette agence.
  await getInspectionRow(tenantId, leaseId, inspectionId);

  const photo = await prisma.leaseInspectionPhoto.findFirst({ where: { id: photoId, inspectionId, tenantId } });
  if (!photo) throw notFound('Photo introuvable.');

  return { filePath: photo.filePath, fileName: photo.fileName, mimeType: photo.mimeType, sizeBytes: photo.sizeBytes };
}

export async function deleteInspectionPhoto(
  tenantId: string,
  leaseId: string,
  inspectionId: string,
  photoId: string
): Promise<void> {
  await assertLeaseForTenant(tenantId, leaseId);
  const inspection = await getInspectionRow(tenantId, leaseId, inspectionId);
  if (inspection.status === LeaseInspectionStatus.FINALIZED) {
    throw conflict('Cet état des lieux est finalisé : ses photos ne peuvent plus être supprimées.');
  }

  const photo = await prisma.leaseInspectionPhoto.findFirst({ where: { id: photoId, inspectionId, tenantId } });
  if (!photo) throw notFound('Photo introuvable.');

  await prisma.leaseInspectionPhoto.delete({ where: { id: photoId, tenantId } });
  await safeUnlink(photo.filePath);
}
