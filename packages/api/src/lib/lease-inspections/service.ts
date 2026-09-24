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

export type Condition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'BROKEN';

export interface InspectionItem {
  id: string;
  label: string;
  condition: Condition | null;
  comment: string | null;
}

export interface InspectionRoom {
  id: string;
  name: string;
  items: InspectionItem[];
}

export interface Deduction {
  id: string;
  label: string;
  amount: number;
  roomId: string | null;
  itemId: string | null;
}

export interface InspectionMeters {
  electricity?: string | null;
  water?: string | null;
  gas?: string | null;
}

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

export interface CompareRow {
  roomId: string;
  roomName: string;
  itemId: string;
  label: string;
  entryCondition: Condition | null;
  exitCondition: Condition | null;
  degraded: boolean;
}

// ---------------------------------------------------------------------------
// Fonctions pures — testables sans base
// ---------------------------------------------------------------------------

const STANDARD_ROOM_ITEMS = ['Sol', 'Murs', 'Plafond', 'Portes', 'Fenêtres', 'Prises et interrupteurs', 'Éclairage'];

function makeItems(labels: string[]): InspectionItem[] {
  return labels.map(label => ({ id: randomUUID(), label, condition: null, comment: null }));
}

/** Modèle de pièces par défaut d'un état des lieux d'entrée. */
export function defaultRooms(): InspectionRoom[] {
  return [
    { id: randomUUID(), name: 'Entrée/Séjour', items: makeItems(STANDARD_ROOM_ITEMS) },
    {
      id: randomUUID(),
      name: 'Cuisine',
      items: makeItems([...STANDARD_ROOM_ITEMS, 'Évier et robinetterie', 'Placards'])
    },
    { id: randomUUID(), name: 'Chambre 1', items: makeItems([...STANDARD_ROOM_ITEMS, 'Placards']) },
    {
      id: randomUUID(),
      name: 'Salle de bain',
      items: makeItems(['Sol', 'Murs', 'Douche ou baignoire', 'Lavabo', 'Robinetterie', 'Ventilation'])
    },
    { id: randomUUID(), name: 'WC', items: makeItems(['Sol', 'Murs', "Cuvette et chasse d'eau"]) }
  ];
}

/** Reprend des pièces existantes avec les mêmes identifiants, états vidés. */
function blankRoomsFrom(rooms: InspectionRoom[]): InspectionRoom[] {
  return rooms.map(room => ({
    id: room.id,
    name: room.name,
    items: room.items.map(item => ({ id: item.id, label: item.label, condition: null, comment: null }))
  }));
}

const CONDITION_RANK: Record<Condition, number> = { NEW: 0, GOOD: 1, FAIR: 2, POOR: 3, BROKEN: 4 };

/**
 * Compare un état des lieux d'entrée et de sortie, élément par élément.
 *
 * Part des pièces de l'entrée, dans leur ordre ; les pièces ou éléments qui
 * n'existent que côté sortie (rooms modifiées après la création de la
 * sortie) sont ajoutés à la suite. `degraded` n'est vrai que lorsque les deux
 * états sont renseignés et que celui de sortie est strictement moins bon.
 */
export function compareInspections(
  entry: { rooms: InspectionRoom[] } | null,
  exit: { rooms: InspectionRoom[] } | null
): CompareRow[] {
  const exitByKey = new Map<string, { room: InspectionRoom; item: InspectionItem }>();
  for (const room of exit?.rooms ?? []) {
    for (const item of room.items) {
      exitByKey.set(`${room.id}:${item.id}`, { room, item });
    }
  }

  const rows: CompareRow[] = [];
  const seen = new Set<string>();

  for (const room of entry?.rooms ?? []) {
    for (const item of room.items) {
      const key = `${room.id}:${item.id}`;
      seen.add(key);
      const exitMatch = exitByKey.get(key);
      const entryCondition = item.condition;
      const exitCondition = exitMatch?.item.condition ?? null;
      rows.push({
        roomId: room.id,
        roomName: room.name,
        itemId: item.id,
        label: item.label,
        entryCondition,
        exitCondition,
        degraded:
          entryCondition !== null &&
          exitCondition !== null &&
          CONDITION_RANK[exitCondition] > CONDITION_RANK[entryCondition]
      });
    }
  }

  for (const room of exit?.rooms ?? []) {
    for (const item of room.items) {
      const key = `${room.id}:${item.id}`;
      if (seen.has(key)) continue;
      rows.push({
        roomId: room.id,
        roomName: room.name,
        itemId: item.id,
        label: item.label,
        entryCondition: null,
        exitCondition: item.condition,
        degraded: false
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Lecture des colonnes JSON — toujours écrites par nous, jamais par l'usager
// directement, mais on reste défensif à la lecture.
// ---------------------------------------------------------------------------

function toRooms(value: unknown): InspectionRoom[] {
  return Array.isArray(value) ? (value as InspectionRoom[]) : [];
}

function toMeters(value: unknown): InspectionMeters | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as InspectionMeters) : null;
}

function toDeductions(value: unknown): Deduction[] {
  return Array.isArray(value) ? (value as Deduction[]) : [];
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
    rooms: toRooms(row.rooms),
    meters: toMeters(row.meters),
    keysCount: row.keysCount,
    generalComment: row.generalComment,
    tenantPresent: row.tenantPresent,
    tenantSignatoryName: row.tenantSignatoryName,
    agentSignatoryName: row.agentSignatoryName,
    deductions: toDeductions(row.deductions),
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
): Promise<{ entry: LeaseInspectionDto | null; exit: LeaseInspectionDto | null; rows: CompareRow[] }> {
  await assertLeaseForTenant(tenantId, leaseId);
  const rows = await prisma.leaseInspection.findMany({
    where: { leaseId, tenantId },
    include: INSPECTION_INCLUDE
  });
  const entryRow = rows.find(row => row.type === LeaseInspectionType.ENTRY);
  const exitRow = rows.find(row => row.type === LeaseInspectionType.EXIT);
  const entry = entryRow ? toDto(entryRow) : null;
  const exit = exitRow ? toDto(exitRow) : null;
  return { entry, exit, rows: compareInspections(entry, exit) };
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

const createInspectionSchema = z.object({
  type: z.enum(['ENTRY', 'EXIT']),
  inspectionDate: dateOnlySchema
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
    rooms = entry ? blankRoomsFrom(toRooms(entry.rooms)) : defaultRooms();
  } else {
    rooms = defaultRooms();
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

const conditionSchema = z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'BROKEN']);

const itemSchema = z.object({
  id: z.string().trim().min(1, "Identifiant d'élément requis."),
  label: z.string().trim().min(1, 'Libellé requis.'),
  condition: conditionSchema.nullable(),
  comment: z.string().trim().max(2000).nullable()
});

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

  const row = await prisma.leaseInspection.update({
    where: { id: inspectionId },
    data: {
      inspectionDate: parseDateOnly(input.inspectionDate),
      rooms: input.rooms as unknown as Prisma.InputJsonValue,
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
  const rooms = toRooms(existing.rooms);
  const hasCondition = rooms.some(room => room.items.some(item => item.condition !== null));
  if (!hasCondition) {
    throw badRequest('Au moins un élément doit avoir un état renseigné avant de finaliser.');
  }

  const row = await prisma.leaseInspection.update({
    where: { id: inspectionId },
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
  await prisma.leaseInspection.delete({ where: { id: inspectionId } });
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

  await prisma.leaseInspectionPhoto.delete({ where: { id: photoId } });
  await safeUnlink(photo.filePath);
}
