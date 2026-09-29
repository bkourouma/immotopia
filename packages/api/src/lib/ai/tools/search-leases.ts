import { z } from 'zod';
import { RentalLeaseStatus } from '@prisma/client';
import { listLeases } from '../../../services/rental-lease-service';
import { getPropertyForTenant } from '../../../utils/property-tenant-guard';
import type { CopilotToolDefinition, LeaseCardItem } from '../contracts';
import { assertToolPermission, clampLimit, isoDay, MAX_TOOL_ITEMS, outcome } from './tool-utils';

const PERMISSION = 'RENTAL_LEASES_VIEW';
const PAGE_SIZE = 50;
/** Parcours maximal quand on filtre en mémoire sur le nom du locataire. */
const MAX_SCANNED_PAGES = 4;

const inputSchema = z
  .object({
    leaseNumber: z.string().trim().min(1).max(60).optional(),
    renterName: z.string().trim().min(1).max(100).optional(),
    propertyId: z.string().uuid().optional(),
    status: z.nativeEnum(RentalLeaseStatus).optional(),
    limit: z.number().int().min(1).max(MAX_TOOL_ITEMS).optional()
  })
  .strict();

interface LeaseRow {
  id: string;
  lease_number: string;
  status: string;
  currency: string;
  rent_amount: { toString(): string } | string | number;
  start_date: Date | string;
  property?: { internalReference?: string; title?: string } | null;
  primaryRenter?: { user?: { fullName?: string | null } | null } | null;
}

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const searchLeasesTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'search_leases',
  description:
    "Retrouve des baux de l'agence par numéro de bail (recherche partielle), nom du locataire, bien ou statut. Renvoie au plus 10 baux.",
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      leaseNumber: { type: 'string', description: 'Numéro de bail, en tout ou partie (ex. « L-00012 »).' },
      renterName: { type: 'string', description: 'Nom du locataire principal, en tout ou partie.' },
      propertyId: { type: 'string', format: 'uuid', description: "Identifiant d'un bien de l'agence." },
      status: { type: 'string', enum: Object.values(RentalLeaseStatus) },
      limit: { type: 'integer', minimum: 1, maximum: MAX_TOOL_ITEMS }
    }
  },
  requiredPermission: PERMISSION,
  feature: 'RENTAL',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);
    const limit = clampLimit(input.limit);
    if (input.propertyId) await getPropertyForTenant(input.propertyId, ctx.tenantId);

    const filters = { status: input.status, propertyId: input.propertyId, search: input.leaseNumber };
    const wanted = input.renterName ? normalize(input.renterName) : null;
    const rows: LeaseRow[] = [];

    if (!wanted) {
      const { data } = await listLeases(ctx.tenantId, filters, { page: 1, limit });
      rows.push(...(data as unknown as LeaseRow[]));
    } else {
      // Pas de recherche par locataire côté service : filtre en mémoire.
      for (let page = 1; page <= MAX_SCANNED_PAGES && rows.length < limit; page += 1) {
        const { data, pagination } = await listLeases(ctx.tenantId, filters, { page, limit: PAGE_SIZE });
        for (const lease of data as unknown as LeaseRow[]) {
          const name = lease.primaryRenter?.user?.fullName;
          if (name && normalize(name).includes(wanted)) rows.push(lease);
        }
        if (page >= pagination.totalPages) break;
      }
    }

    const items: LeaseCardItem[] = rows.slice(0, limit).map(lease => ({
      id: lease.id,
      leaseNumber: lease.lease_number,
      status: lease.status,
      propertyLabel: lease.property ? `${lease.property.internalReference ?? ''} — ${lease.property.title ?? ''}` : '',
      renterName: lease.primaryRenter?.user?.fullName ?? null,
      rentAmount: String(lease.rent_amount),
      currency: lease.currency,
      startDate: isoDay(lease.start_date) ?? ''
    }));

    for (const item of items) ctx.seenLeaseIds.add(item.id);

    return outcome({ count: items.length, items }, { type: 'lease_results', items });
  }
};
