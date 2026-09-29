import { z } from 'zod';
import { PropertyStatus, PropertyType, PropertyTransactionMode } from '@prisma/client';
import { listProperties } from '../../../services/property-service';
import type { CopilotToolDefinition, PropertyCardItem } from '../contracts';
import { assertToolPermission, clampLimit, MAX_TOOL_ITEMS, outcome } from './tool-utils';

const PERMISSION = 'PROPERTIES_VIEW';

const inputSchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    propertyType: z.nativeEnum(PropertyType).optional(),
    status: z.nativeEnum(PropertyStatus).optional(),
    transactionMode: z.nativeEnum(PropertyTransactionMode).optional(),
    minPrice: z.number().nonnegative().optional(),
    maxPrice: z.number().nonnegative().optional(),
    minBedrooms: z.number().int().min(0).max(50).optional(),
    limit: z.number().int().min(1).max(MAX_TOOL_ITEMS).optional()
  })
  .strict();

/** Champs lus sur un bien de `listProperties` — le reste (propriétaire, e-mail…) est ignoré. */
interface PropertyRow {
  id: string;
  internalReference: string;
  title: string;
  propertyType: string;
  status: string;
  ownershipType: string;
  tenantId: string | null;
  locationZone: string | null;
  address: string;
  price: number | null;
  currency: string;
  bedrooms: number | null;
  surfaceArea: number | null;
  media?: Array<{ fileUrl: string | null }>;
}

export const searchPropertiesTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'search_properties',
  description:
    "Recherche des biens immobiliers de l'agence (par texte, commune ou zone, type, statut, prix, chambres). Renvoie au plus 10 biens.",
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      q: { type: 'string', description: 'Texte libre : titre, adresse ou référence interne.' },
      city: { type: 'string', description: "Commune ou zone (cherchée dans l'adresse et la zone)." },
      propertyType: { type: 'string', enum: Object.values(PropertyType) },
      status: { type: 'string', enum: Object.values(PropertyStatus) },
      transactionMode: { type: 'string', enum: Object.values(PropertyTransactionMode) },
      minPrice: { type: 'number', minimum: 0 },
      maxPrice: { type: 'number', minimum: 0 },
      minBedrooms: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 1, maximum: MAX_TOOL_ITEMS }
    }
  },
  requiredPermission: PERMISSION,
  feature: 'CORE',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, PERMISSION);
    const limit = clampLimit(input.limit);
    const { properties, total } = await listProperties(ctx.tenantId, ctx.userId, {
      q: input.q,
      city: input.city,
      propertyType: input.propertyType,
      status: input.status,
      transactionMode: input.transactionMode,
      minPrice: input.minPrice,
      maxPrice: input.maxPrice,
      minBedrooms: input.minBedrooms,
      page: 1,
      limit
    });

    // `listProperties` inclut aussi les biens PUBLIC publiés d'autres agences :
    // l'assistant ne renvoie que les biens de l'agence (propres ou sous mandat).
    const rows = (properties as unknown as PropertyRow[])
      .filter(p => p.ownershipType !== 'PUBLIC' && (p.tenantId === null || p.tenantId === ctx.tenantId))
      .slice(0, limit);

    const items: PropertyCardItem[] = rows.map(p => ({
      id: p.id,
      internalReference: p.internalReference,
      title: p.title,
      propertyType: p.propertyType,
      status: p.status,
      locationZone: p.locationZone ?? null,
      address: p.address,
      price: p.price ?? null,
      currency: p.currency,
      bedrooms: p.bedrooms ?? null,
      surfaceArea: p.surfaceArea ?? null,
      thumbnailUrl: p.media?.[0]?.fileUrl ?? null
    }));

    return outcome(
      {
        total,
        count: items.length,
        items: items.map(({ thumbnailUrl: _thumbnail, ...rest }) => rest)
      },
      { type: 'property_results', items, total }
    );
  }
};
