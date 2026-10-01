import type { MaintenanceLogEntry, Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { BadRequestError, NotFoundError } from '../../../middleware/error-middleware';
import { getPropertyForTenant } from '../../../utils/property-tenant-guard';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import type {
  CreateMaintenanceLogEntryInput,
  ListMaintenanceLogQuery,
  UpdateMaintenanceLogEntryInput
} from './maintenance-log-schemas';
import { buildMaintenanceLogCsv } from './maintenance-log-csv';
import { assertDocumentOfProperty } from './references';

/**
 * Carnet d'entretien d'un bien (lot B1, spec 032).
 *
 * Toute référence reçue (bien, prestataire, pièce, entrée) est vérifiée par
 * agence AVANT lecture ou écriture : une référence d'une autre agence lève la
 * même `NotFoundError` qu'un objet inexistant. Les montants sortent en
 * `number`, les dates en ISO 8601.
 */

export interface MaintenanceLogEntryDto {
  id: string;
  propertyId: string;
  category: MaintenanceLogEntry['category'];
  performedAt: string;
  vendorId: string | null;
  vendorName: string | null;
  cost: number | null;
  currency: string;
  description: string;
  nextDueDate: string | null;
  warrantyEndDate: string | null;
  documentId: string | null;
  createdAt: string;
  updatedAt: string;
}

const NOT_FOUND_ENTRY = "Entrée du carnet d'entretien introuvable.";

type EntryWithVendor = MaintenanceLogEntry & { vendor: { id: string; name: string } | null };

const ENTRY_INCLUDE = { vendor: { select: { id: true, name: true } } } satisfies Prisma.MaintenanceLogEntryInclude;

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

export function toMaintenanceLogEntryDto(entry: EntryWithVendor): MaintenanceLogEntryDto {
  return {
    id: entry.id,
    propertyId: entry.propertyId,
    category: entry.category,
    performedAt: entry.performedAt.toISOString(),
    vendorId: entry.vendorId,
    vendorName: entry.vendor?.name ?? null,
    cost: entry.cost === null ? null : Number(entry.cost),
    currency: entry.currency,
    description: entry.description,
    nextDueDate: iso(entry.nextDueDate),
    warrantyEndDate: iso(entry.warrantyEndDate),
    documentId: entry.documentId,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString()
  };
}

/** Prestataire de l'agence (champ `tenant_id`) : sinon 404, comme un inexistant. */
async function assertVendorBelongs(tenantId: string, vendorId: string | null | undefined): Promise<void> {
  await assertBelongsToTenant(prisma, 'maintenanceVendor', vendorId, tenantId, {
    tenantField: 'tenant_id',
    message: 'Prestataire introuvable.'
  });
}

async function getEntryForTenant(tenantId: string, entryId: string): Promise<MaintenanceLogEntry> {
  const entry = await prisma.maintenanceLogEntry.findFirst({ where: { id: entryId, tenantId } });
  if (!entry) throw new NotFoundError(NOT_FOUND_ENTRY);
  return entry;
}

/** Échéance et garantie ne précèdent jamais l'intervention (valeurs effectives, après fusion). */
function assertDatesCoherent(performedAt: Date, nextDueDate: Date | null, warrantyEndDate: Date | null): void {
  if (nextDueDate && nextDueDate < performedAt) {
    throw new BadRequestError("La prochaine échéance ne peut pas précéder la date d'intervention.");
  }
  if (warrantyEndDate && warrantyEndDate < performedAt) {
    throw new BadRequestError("La fin de garantie ne peut pas précéder la date d'intervention.");
  }
}

async function loadEntries(tenantId: string, propertyId: string, category?: ListMaintenanceLogQuery['category']) {
  return prisma.maintenanceLogEntry.findMany({
    where: { tenantId, propertyId, ...(category ? { category } : {}) },
    include: ENTRY_INCLUDE,
    orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }]
  });
}

export async function listMaintenanceLog(
  tenantId: string,
  query: ListMaintenanceLogQuery
): Promise<MaintenanceLogEntryDto[]> {
  await getPropertyForTenant(query.propertyId, tenantId);
  const entries = await loadEntries(tenantId, query.propertyId, query.category);
  return entries.map(toMaintenanceLogEntryDto);
}

export async function exportMaintenanceLogCsv(
  tenantId: string,
  propertyId: string
): Promise<{ csv: string; filename: string }> {
  const property = await getPropertyForTenant(propertyId, tenantId);
  const entries = await loadEntries(tenantId, propertyId);
  const csv = buildMaintenanceLogCsv(entries.map(toMaintenanceLogEntryDto));
  const reference = (property.internalReference ?? property.id).replace(/[^A-Za-z0-9_-]/g, '_');
  return { csv, filename: `carnet-entretien-${reference}.csv` };
}

export async function createMaintenanceLogEntry(
  tenantId: string,
  input: CreateMaintenanceLogEntryInput,
  userId?: string
): Promise<MaintenanceLogEntryDto> {
  await getPropertyForTenant(input.propertyId, tenantId);
  await assertVendorBelongs(tenantId, input.vendorId);
  await assertDocumentOfProperty(tenantId, input.propertyId, input.documentId);
  assertDatesCoherent(input.performedAt, input.nextDueDate ?? null, input.warrantyEndDate ?? null);

  const created = await prisma.maintenanceLogEntry.create({
    data: {
      tenantId,
      propertyId: input.propertyId,
      category: input.category,
      performedAt: input.performedAt,
      description: input.description,
      vendorId: input.vendorId ?? null,
      cost: input.cost ?? null,
      ...(input.currency ? { currency: input.currency } : {}),
      nextDueDate: input.nextDueDate ?? null,
      warrantyEndDate: input.warrantyEndDate ?? null,
      documentId: input.documentId ?? null,
      createdByUserId: userId ?? null
    },
    include: ENTRY_INCLUDE
  });
  return toMaintenanceLogEntryDto(created);
}

export async function updateMaintenanceLogEntry(
  tenantId: string,
  entryId: string,
  patch: UpdateMaintenanceLogEntryInput
): Promise<MaintenanceLogEntryDto> {
  const existing = await getEntryForTenant(tenantId, entryId);
  await assertVendorBelongs(tenantId, patch.vendorId);
  await assertDocumentOfProperty(tenantId, existing.propertyId, patch.documentId);

  assertDatesCoherent(
    patch.performedAt ?? existing.performedAt,
    patch.nextDueDate === undefined ? existing.nextDueDate : patch.nextDueDate,
    patch.warrantyEndDate === undefined ? existing.warrantyEndDate : patch.warrantyEndDate
  );

  // `updateMany` sur `{ id, tenantId }` : le filtre d'agence reste au premier niveau du where.
  const result = await prisma.maintenanceLogEntry.updateMany({
    where: { id: existing.id, tenantId },
    data: {
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.performedAt !== undefined ? { performedAt: patch.performedAt } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.vendorId !== undefined ? { vendorId: patch.vendorId } : {}),
      ...(patch.cost !== undefined ? { cost: patch.cost } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.nextDueDate !== undefined ? { nextDueDate: patch.nextDueDate } : {}),
      ...(patch.warrantyEndDate !== undefined ? { warrantyEndDate: patch.warrantyEndDate } : {}),
      ...(patch.documentId !== undefined ? { documentId: patch.documentId } : {})
    }
  });
  if (result.count === 0) throw new NotFoundError(NOT_FOUND_ENTRY);
  const updated = await prisma.maintenanceLogEntry.findFirst({
    where: { id: existing.id, tenantId },
    include: ENTRY_INCLUDE
  });
  if (!updated) throw new NotFoundError(NOT_FOUND_ENTRY);
  return toMaintenanceLogEntryDto(updated);
}

export async function deleteMaintenanceLogEntry(tenantId: string, entryId: string): Promise<void> {
  const result = await prisma.maintenanceLogEntry.deleteMany({ where: { id: entryId, tenantId } });
  if (result.count === 0) throw new NotFoundError(NOT_FOUND_ENTRY);
}
