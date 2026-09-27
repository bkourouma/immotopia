import { z } from 'zod';
import { prisma } from '../../utils/database';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import {
  deleteBrandingImage,
  readBrandingImage,
  saveBrandingImage,
  validateBrandingImage,
  type BrandingImage
} from './branding-storage';
import { syndicateLogoApiPath } from './syndicate-branding-view';

/**
 * Agences mandantes et images d'identité des documents (lot S1, besoin 7).
 *
 * Un cabinet de syndic (un seul tenant) gère des copropriétés pour le compte
 * d'agences clientes, les « mandants ». Chaque requête est filtrée par
 * l'agence ; un identifiant d'une autre agence répond le même 404 qu'un
 * identifiant inexistant. Les réponses n'exposent jamais de clé de stockage :
 * des booléens `hasLogo/hasSignature/hasStamp` et les URL d'API de lecture.
 */

// ------------------------------------------------------------------ schémas

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform(value => (value === undefined ? undefined : value ? value : null));

const mandatingAgencyFields = {
  name: z.string().trim().min(1, "Le nom de l'agence mandante est obligatoire").max(200),
  legalName: optionalText(200),
  address: optionalText(500),
  phone: optionalText(50),
  email: z
    .union([z.string().trim().email("L'adresse e-mail de l'agence mandante est invalide"), z.literal('')])
    .nullable()
    .optional()
    .transform(value => (value === undefined ? undefined : value ? value : null)),
  rccm: optionalText(100),
  taxId: optionalText(100)
};

export const createMandatingAgencySchema = z.object(mandatingAgencyFields);

export const updateMandatingAgencySchema = z
  .object({ ...mandatingAgencyFields, name: mandatingAgencyFields.name.optional() })
  .refine(value => Object.values(value).some(field => field !== undefined), {
    message: 'Au moins un champ doit etre fourni pour la mise a jour'
  });

export type CreateMandatingAgencyInput = z.infer<typeof createMandatingAgencySchema>;
export type UpdateMandatingAgencyInput = z.infer<typeof updateMandatingAgencySchema>;

// ------------------------------------------------------------------ images

export const MANDANT_IMAGE_KINDS = ['logo', 'signature', 'stamp'] as const;
export type MandantImageKind = (typeof MANDANT_IMAGE_KINDS)[number];
export const AGENCY_IMAGE_KINDS = ['signature', 'stamp'] as const;
export type AgencyImageKind = (typeof AGENCY_IMAGE_KINDS)[number];

const MANDANT_IMAGE_FIELD = { logo: 'logoPath', signature: 'signaturePath', stamp: 'stampPath' } as const;
const AGENCY_IMAGE_FIELD = { signature: 'documentSignaturePath', stamp: 'documentStampPath' } as const;
/** Nom du fichier sur disque (en français, comme le dossier de l'agence). */
const IMAGE_BASENAME = { logo: 'logo', signature: 'signature', stamp: 'cachet' } as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identifiant de chemin : les colonnes sont des `uuid` Postgres, et une
 * valeur mal formée ferait lever Prisma (500). On répond le même 404 qu'un
 * objet absent.
 */
export function assertUuidOrNotFound(id: string | undefined, message: string): string {
  if (!id || !UUID_PATTERN.test(id)) throw new NotFoundError(message);
  return id;
}

export function parseMandantImageKind(kind: string | undefined): MandantImageKind {
  if ((MANDANT_IMAGE_KINDS as readonly string[]).includes(kind ?? '')) return kind as MandantImageKind;
  throw new NotFoundError('Image introuvable.');
}

export function parseAgencyImageKind(kind: string | undefined): AgencyImageKind {
  if ((AGENCY_IMAGE_KINDS as readonly string[]).includes(kind ?? '')) return kind as AgencyImageKind;
  throw new NotFoundError('Image introuvable.');
}

type UploadedFile = { buffer?: Buffer; size?: number } | undefined | null;

// ------------------------------------------------------------------ vues

type MandantRow = {
  id: string;
  tenantId: string;
  name: string;
  legalName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  rccm: string | null;
  taxId: string | null;
  logoPath: string | null;
  signaturePath: string | null;
  stampPath: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { syndicates: number };
  syndicates?: Array<{ id: string; name: string }>;
};

export function mandantImageApiPath(tenantId: string, agencyId: string, kind: MandantImageKind): string {
  return `/tenants/${tenantId}/syndic-mandating-agencies/${agencyId}/images/${kind}`;
}

export function agencyImageApiPath(tenantId: string, kind: AgencyImageKind): string {
  return `/tenants/${tenantId}/document-identity/images/${kind}`;
}

export function toMandatingAgencyResponse(row: MandantRow) {
  const url = (kind: MandantImageKind, key: string | null) =>
    key ? mandantImageApiPath(row.tenantId, row.id, kind) : null;
  return {
    id: row.id,
    name: row.name,
    legalName: row.legalName,
    address: row.address,
    phone: row.phone,
    email: row.email,
    rccm: row.rccm,
    taxId: row.taxId,
    hasLogo: Boolean(row.logoPath),
    hasSignature: Boolean(row.signaturePath),
    hasStamp: Boolean(row.stampPath),
    logoUrl: url('logo', row.logoPath),
    signatureUrl: url('signature', row.signaturePath),
    stampUrl: url('stamp', row.stampPath),
    syndicateCount: row._count?.syndicates ?? row.syndicates?.length ?? 0,
    ...(row.syndicates ? { syndicates: row.syndicates.map(s => ({ id: s.id, name: s.name })) } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

// ------------------------------------------------------------------ CRUD

async function findMandant(tenantId: string, agencyId: string) {
  const row = await prisma.syndicMandatingAgency.findFirst({ where: { id: agencyId, tenantId } });
  if (!row) throw new NotFoundError('Agence mandante introuvable.');
  return row;
}

async function assertNameAvailable(tenantId: string, name: string, exceptId?: string) {
  const clash = await prisma.syndicMandatingAgency.findFirst({
    where: { tenantId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true }
  });
  if (clash) throw new ConflictError('Une agence mandante porte déjà ce nom.');
}

export async function listMandatingAgencies(tenantId: string) {
  const rows = await prisma.syndicMandatingAgency.findMany({
    where: { tenantId },
    include: { _count: { select: { syndicates: true } } },
    orderBy: { name: 'asc' }
  });
  return rows.map(toMandatingAgencyResponse);
}

export async function getMandatingAgency(tenantId: string, agencyId: string) {
  const row = await prisma.syndicMandatingAgency.findFirst({
    where: { id: agencyId, tenantId },
    include: { syndicates: { where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } } }
  });
  if (!row) throw new NotFoundError('Agence mandante introuvable.');
  return toMandatingAgencyResponse(row);
}

export async function createMandatingAgency(tenantId: string, input: CreateMandatingAgencyInput) {
  await assertNameAvailable(tenantId, input.name);
  const row = await prisma.syndicMandatingAgency.create({
    data: {
      tenantId,
      name: input.name,
      legalName: input.legalName ?? null,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      rccm: input.rccm ?? null,
      taxId: input.taxId ?? null
    }
  });
  return toMandatingAgencyResponse(row);
}

export async function updateMandatingAgency(tenantId: string, agencyId: string, input: UpdateMandatingAgencyInput) {
  await findMandant(tenantId, agencyId);
  if (input.name) await assertNameAvailable(tenantId, input.name, agencyId);
  const row = await prisma.syndicMandatingAgency.update({
    where: { id: agencyId, tenantId },
    data: input
  });
  return toMandatingAgencyResponse(row);
}

/** Refusée (409) tant qu'une copropriété y est rattachée ; ses images partent avec elle. */
export async function deleteMandatingAgency(tenantId: string, agencyId: string) {
  const row = await findMandant(tenantId, agencyId);
  const linked = await prisma.syndicate.count({ where: { tenantId, mandatingAgencyId: agencyId } });
  if (linked > 0) {
    throw new ConflictError(
      'Cette agence mandante est rattachée à au moins une copropriété : détachez-les avant de la supprimer.'
    );
  }
  await prisma.syndicMandatingAgency.delete({ where: { id: agencyId, tenantId } });
  await Promise.all([
    deleteBrandingImage(tenantId, row.logoPath),
    deleteBrandingImage(tenantId, row.signaturePath),
    deleteBrandingImage(tenantId, row.stampPath)
  ]);
  return { id: agencyId };
}

// ------------------------------------------------------------------ images des mandants

export async function uploadMandantImage(
  tenantId: string,
  agencyId: string,
  kind: MandantImageKind,
  file: UploadedFile
) {
  const format = validateBrandingImage(file);
  const row = await findMandant(tenantId, agencyId);
  const field = MANDANT_IMAGE_FIELD[kind];
  const key = await saveBrandingImage(tenantId, ['mandants', agencyId], IMAGE_BASENAME[kind], file!.buffer!, format);
  const updated = await prisma.syndicMandatingAgency.update({
    where: { id: agencyId, tenantId },
    data: { [field]: key }
  });
  // L'ancien fichier ne part qu'une fois la nouvelle clé enregistrée.
  await deleteBrandingImage(tenantId, row[field]);
  return toMandatingAgencyResponse(updated);
}

export async function removeMandantImage(tenantId: string, agencyId: string, kind: MandantImageKind) {
  const row = await findMandant(tenantId, agencyId);
  const field = MANDANT_IMAGE_FIELD[kind];
  const updated = await prisma.syndicMandatingAgency.update({
    where: { id: agencyId, tenantId },
    data: { [field]: null }
  });
  await deleteBrandingImage(tenantId, row[field]);
  return toMandatingAgencyResponse(updated);
}

export async function readMandantImage(
  tenantId: string,
  agencyId: string,
  kind: MandantImageKind
): Promise<BrandingImage> {
  const row = await findMandant(tenantId, agencyId);
  const image = await readBrandingImage(tenantId, row[MANDANT_IMAGE_FIELD[kind]]);
  if (!image) throw new NotFoundError('Image introuvable.');
  return image;
}

// ------------------------------------------------------------------ logo d'une copropriété

const SYNDICATE_NOT_FOUND = 'Copropriete introuvable ou inaccessible';

async function findSyndicateLogo(tenantId: string, syndicateId: string) {
  const row = await prisma.syndicate.findFirst({
    where: { id: syndicateId, tenantId },
    select: { id: true, logoPath: true }
  });
  if (!row) throw new NotFoundError(SYNDICATE_NOT_FOUND);
  return row;
}

function syndicateLogoView(tenantId: string, syndicateId: string, logoPath: string | null) {
  return {
    id: syndicateId,
    hasLogo: Boolean(logoPath),
    logoUrl: logoPath ? syndicateLogoApiPath(tenantId, syndicateId) : null
  };
}

export async function uploadSyndicateLogo(tenantId: string, syndicateId: string, file: UploadedFile) {
  const format = validateBrandingImage(file);
  const row = await findSyndicateLogo(tenantId, syndicateId);
  const key = await saveBrandingImage(tenantId, ['syndics', syndicateId], 'logo', file!.buffer!, format);
  await prisma.syndicate.update({ where: { id: syndicateId, tenantId }, data: { logoPath: key } });
  await deleteBrandingImage(tenantId, row.logoPath);
  return syndicateLogoView(tenantId, syndicateId, key);
}

export async function removeSyndicateLogo(tenantId: string, syndicateId: string) {
  const row = await findSyndicateLogo(tenantId, syndicateId);
  await prisma.syndicate.update({ where: { id: syndicateId, tenantId }, data: { logoPath: null } });
  await deleteBrandingImage(tenantId, row.logoPath);
  return syndicateLogoView(tenantId, syndicateId, null);
}

export async function readSyndicateLogo(tenantId: string, syndicateId: string): Promise<BrandingImage> {
  const row = await findSyndicateLogo(tenantId, syndicateId);
  const image = await readBrandingImage(tenantId, row.logoPath);
  if (!image) throw new NotFoundError('Image introuvable.');
  return image;
}

// ------------------------------------------------------------------ signature et cachet de l'agence

async function findTenantIdentity(tenantId: string) {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, logoUrl: true, documentSignaturePath: true, documentStampPath: true }
  });
  if (!row) throw new NotFoundError('Agence introuvable.');
  return row;
}

function agencyIdentityView(
  tenantId: string,
  row: { logoUrl: string | null; documentSignaturePath: string | null; documentStampPath: string | null }
) {
  return {
    // Le logo de l'agence reste celui de sa fiche (`POST /tenants/:tenantId/logo`), public.
    hasLogo: Boolean(row.logoUrl),
    logoUrl: row.logoUrl,
    hasSignature: Boolean(row.documentSignaturePath),
    hasStamp: Boolean(row.documentStampPath),
    signatureUrl: row.documentSignaturePath ? agencyImageApiPath(tenantId, 'signature') : null,
    stampUrl: row.documentStampPath ? agencyImageApiPath(tenantId, 'stamp') : null
  };
}

export async function getAgencyDocumentIdentity(tenantId: string) {
  return agencyIdentityView(tenantId, await findTenantIdentity(tenantId));
}

export async function uploadAgencyImage(tenantId: string, kind: AgencyImageKind, file: UploadedFile) {
  const format = validateBrandingImage(file);
  const row = await findTenantIdentity(tenantId);
  const field = AGENCY_IMAGE_FIELD[kind];
  const key = await saveBrandingImage(tenantId, ['agence'], IMAGE_BASENAME[kind], file!.buffer!, format);
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { [field]: key },
    select: { logoUrl: true, documentSignaturePath: true, documentStampPath: true }
  });
  await deleteBrandingImage(tenantId, row[field]);
  return agencyIdentityView(tenantId, updated);
}

export async function removeAgencyImage(tenantId: string, kind: AgencyImageKind) {
  const row = await findTenantIdentity(tenantId);
  const field = AGENCY_IMAGE_FIELD[kind];
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { [field]: null },
    select: { logoUrl: true, documentSignaturePath: true, documentStampPath: true }
  });
  await deleteBrandingImage(tenantId, row[field]);
  return agencyIdentityView(tenantId, updated);
}

export async function readAgencyImage(tenantId: string, kind: AgencyImageKind): Promise<BrandingImage> {
  const row = await findTenantIdentity(tenantId);
  const image = await readBrandingImage(tenantId, row[AGENCY_IMAGE_FIELD[kind]]);
  if (!image) throw new NotFoundError('Image introuvable.');
  return image;
}
