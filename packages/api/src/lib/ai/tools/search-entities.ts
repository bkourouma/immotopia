import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { t } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { escapeLike } from '../../../utils/like-escape';
import { propertyTenantWhere } from '../../../utils/property-tenant-guard';
import { mandateNumber } from '../../sales/numbering';
import type { AnalysisTable, CopilotToolContext, CopilotToolDefinition } from '../contracts';
import { assertToolPermission, clampLimit, MAX_TOOL_ITEMS, outcome } from './tool-utils';

const searchText = z.string().trim().max(100);
const fields = { q: searchText.min(2), limit: z.number().int().min(1).max(MAX_TOOL_ITEMS).optional() };
const searchSchema = z.object(fields).strict();
const lotsSchema = z.object({ ...fields, q: searchText.min(1), syndicateId: z.string().uuid().optional() }).strict();
const query = {
  q: { type: 'string', minLength: 2, maxLength: 100 },
  limit: { type: 'integer', minimum: 1, maximum: MAX_TOOL_ITEMS }
};
const searchJsonSchema = { type: 'object', additionalProperties: false, required: ['q'], properties: query };
const uuid = z.string().uuid();
const contains = (q: string) => ({ contains: escapeLike(q), mode: 'insensitive' as const });
const tenantPath = (ctx: CopilotToolContext) => '/tenant/' + encodeURIComponent(ctx.tenantId);

type Match = Record<string, string | null> & { id: string; href: string };

function displayMatches(title: string, columns: AnalysisTable['columns'], records: Match[], limit: number) {
  const items = records.slice(0, limit);
  const truncated = records.length > limit;
  return outcome(
    { count: items.length, truncated, items },
    items.length
      ? { type: 'artifact', artifact: { id: randomUUID(), kind: 'table', title, columns, rows: items, truncated } }
      : undefined
  );
}

export const searchSyndicatesTool: CopilotToolDefinition<typeof searchSchema> = {
  name: 'search_syndicates',
  description:
    'Retrouve les copropriétés de l’agence par nom, numéro d’immatriculation ou référence cadastrale. Renvoie les identifiants utiles aux analyses syndic.',
  inputSchema: searchSchema,
  jsonSchema: searchJsonSchema,
  requiredPermission: 'SYNDIC_VIEW',
  feature: 'SYNDIC',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, 'SYNDIC_VIEW');
    const text = contains(input.q);
    const limit = clampLimit(input.limit);
    const rows = await prisma.syndicate.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { not: 'IN_LIQUIDATION' },
        OR: [{ name: text }, { registrationNo: text }, { cadastralReference: text }]
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, registrationNo: true, cadastralReference: true },
      take: limit + 1
    });
    return displayMatches(
      t('Copropriétés trouvées'),
      [
        { key: 'name', label: t('Copropriété'), linkKey: 'href' },
        { key: 'registrationNo', label: t('Immatriculation') },
        { key: 'cadastralReference', label: t('Référence cadastrale') }
      ],
      rows.map(row => ({ ...row, href: tenantPath(ctx) + '/syndics/' + row.id })),
      limit
    );
  }
};

export const searchSyndicateLotsTool: CopilotToolDefinition<typeof lotsSchema> = {
  name: 'search_syndicate_lots',
  description:
    'Retrouve les lots par numéro ou par titre ou référence du bien lié, dans les copropriétés de l’agence. Avec syndicateId, limite la recherche à cette copropriété. Renvoie le lot et sa copropriété.',
  inputSchema: lotsSchema,
  jsonSchema: {
    ...searchJsonSchema,
    properties: { ...query, q: { ...query.q, minLength: 1 }, syndicateId: { type: 'string', format: 'uuid' } }
  },
  requiredPermission: 'SYNDIC_VIEW',
  feature: 'SYNDIC',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, 'SYNDIC_VIEW');
    const text = contains(input.q);
    const limit = clampLimit(input.limit);
    const rows = await prisma.syndicateLot.findMany({
      where: {
        syndicate: { tenantId: ctx.tenantId, id: input.syndicateId, status: { not: 'IN_LIQUIDATION' } },
        OR: [
          { lotNumber: input.q.length === 1 ? { equals: input.q, mode: 'insensitive' } : text },
          { property: { ...propertyTenantWhere(ctx.tenantId), OR: [{ title: text }, { internalReference: text }] } }
        ]
      },
      orderBy: [{ lotNumber: 'asc' }, { id: 'asc' }],
      select: { id: true, lotNumber: true, lotType: true, syndicate: { select: { id: true, name: true } } },
      take: limit + 1
    });
    const lotTypes = {
      APARTMENT: t('Appartement'),
      PARKING: t('Parking'),
      CELLAR: t('Cave'),
      OFFICE: t('Bureau'),
      COMMERCIAL: t('Local commercial'),
      OTHER: t('Autre')
    };
    return displayMatches(
      t('Lots de copropriété trouvés'),
      [
        { key: 'lotNumber', label: t('Numéro de lot'), linkKey: 'href' },
        { key: 'syndicateName', label: t('Copropriété') },
        { key: 'lotType', label: t('Type de lot') }
      ],
      rows.map(({ syndicate, ...row }) => ({
        ...row,
        lotType: lotTypes[row.lotType],
        syndicateId: syndicate.id,
        syndicateName: syndicate.name,
        href: tenantPath(ctx) + '/syndics/' + syndicate.id + '/lots'
      })),
      limit
    );
  }
};

export const searchSaleMandatesTool: CopilotToolDefinition<typeof searchSchema> = {
  name: 'search_sale_mandates',
  description:
    'Retrouve des mandats de vente par numéro complet MV-AAAA-NNNN, préfixe MV-AAAA, titre ou référence du bien. La recherche couvre les différents statuts des mandats.',
  inputSchema: searchSchema,
  jsonSchema: searchJsonSchema,
  requiredPermission: 'CRM_DEALS_VIEW',
  feature: 'SALES',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, 'CRM_DEALS_VIEW');
    const text = contains(input.q);
    const number = /^MV-(\d{4})(?:-(\d{1,10}))?$/i.exec(input.q);
    const sequence = number?.[2] ? Number(number[2]) : undefined;
    const limit = clampLimit(input.limit);
    const rows = await prisma.saleMandate.findMany({
      where: {
        tenantId: ctx.tenantId,
        property: propertyTenantWhere(ctx.tenantId),
        OR: [
          ...(number && (sequence === undefined || sequence <= 2_147_483_647)
            ? [{ year: Number(number[1]), sequence }]
            : []),
          { property: { OR: [{ title: text }, { internalReference: text }] } }
        ]
      },
      orderBy: [{ year: 'desc' }, { sequence: 'desc' }, { id: 'asc' }],
      select: { id: true, year: true, sequence: true, status: true, property: { select: { id: true, title: true } } },
      take: limit + 1
    });
    const statuses = { ACTIVE: t('Actif'), REVOKED: t('Révoqué'), COMPLETED: t('Terminé') };
    return displayMatches(
      t('Mandats de vente trouvés'),
      [
        { key: 'number', label: t('Mandat'), linkKey: 'href' },
        { key: 'propertyName', label: t('Bien') },
        { key: 'status', label: t('Statut') }
      ],
      rows.map(row => ({
        id: row.id,
        status: statuses[row.status],
        propertyId: row.property.id,
        propertyName: row.property.title,
        number: mandateNumber(row.year, row.sequence),
        href: tenantPath(ctx) + '/sales/mandates/' + row.id
      })),
      limit
    );
  }
};

export const searchConstructionSitesTool: CopilotToolDefinition<typeof searchSchema> = {
  name: 'search_construction_sites',
  description:
    'Retrouve les chantiers de l’agence par nom, zone, identifiant exact ou référence du bien lié. Renvoie les identifiants utiles aux analyses de construction.',
  inputSchema: searchSchema,
  jsonSchema: searchJsonSchema,
  requiredPermission: 'FINANCE_ACCOUNTS_READ',
  feature: 'CONSTRUCTION',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, 'FINANCE_ACCOUNTS_READ');
    const text = contains(input.q);
    const limit = clampLimit(input.limit);
    const rows = await prisma.constructionSite.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          ...(uuid.safeParse(input.q).success ? [{ id: input.q }] : []),
          { name: text },
          { zone: text },
          { property: { ...propertyTenantWhere(ctx.tenantId), internalReference: text } }
        ]
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, zone: true, status: true },
      take: limit + 1
    });
    const statuses = {
      PLANNED: t('Planifié'),
      IN_PROGRESS: t('En cours'),
      SUSPENDED: t('Suspendu'),
      CLOSED: t('Clôturé')
    };
    return displayMatches(
      t('Chantiers trouvés'),
      [
        { key: 'name', label: t('Chantier'), linkKey: 'href' },
        { key: 'zone', label: t('Zone') },
        { key: 'status', label: t('Statut') }
      ],
      rows.map(row => ({
        ...row,
        status: statuses[row.status],
        href: tenantPath(ctx) + '/finance/chantiers/' + row.id
      })),
      limit
    );
  }
};
