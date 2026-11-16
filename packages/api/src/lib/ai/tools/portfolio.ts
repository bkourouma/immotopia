import { randomUUID } from 'node:crypto';
import { PropertyStatus, PropertyType, RentalLeaseStatus } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { BadRequestError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import { isOccupiedPropertyStatus, propertyOccupancyRate } from '../../../utils/property-occupancy';
import { getPropertyForTenant, propertyTenantWhere } from '../../../utils/property-tenant-guard';
import { COPILOT_ARTIFACT_MAX_ROWS as maxRows, type AnalysisTable, type CopilotToolDefinition } from '../contracts';
import { assertToolPermission, isoDay, outcome } from './tool-utils';

const propertyPermission = 'PROPERTIES_VIEW';
const leasePermission = 'RENTAL_LEASES_VIEW';
const propertyIdSchema = z.string().uuid();
const portfolioSchema = z
  .object({
    propertyType: z.nativeEnum(PropertyType).optional(),
    zone: z.string().trim().min(1).max(120).optional(),
    groupBy: z.enum(['propertyType', 'zone']).optional()
  })
  .strict();
const endDateSchema = z.string().date();
const leasesSchema = z
  .object({
    propertyId: propertyIdSchema.optional(),
    start: endDateSchema.optional(),
    end: endDateSchema.optional(),
    onlyEnding: z.boolean().optional()
  })
  .strict();

function publish(artifact: AnalysisTable, rows: AnalysisTable['rows'], totals: Record<string, number | null>) {
  return outcome(
    {
      artifactId: artifact.id,
      period: artifact.provenance?.period,
      count: rows.length,
      truncated: artifact.truncated,
      totals,
      columns: artifact.columns.map(column => column.key),
      items: rows.slice(0, 8)
    },
    { type: 'artifact', artifact }
  );
}

export const propertyPortfolioTool: CopilotToolDefinition<typeof portfolioSchema> = {
  name: 'property_portfolio',
  description:
    'Analyse le parc actuel. Donne les volumes, les biens occupés (statut loué ou vendu), disponibles et le taux d’occupation par type ou zone. Peut filtrer par type et par zone exacte. Ne fournit pas une photographie historique.',
  inputSchema: portfolioSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      propertyType: { type: 'string', enum: Object.values(PropertyType) },
      zone: { type: 'string', maxLength: 120 },
      groupBy: { type: 'string', enum: ['propertyType', 'zone'] }
    }
  },
  requiredPermission: propertyPermission,
  feature: 'CORE',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, propertyPermission);
    const now = new Date().toISOString();
    const dimension = input.groupBy ?? 'propertyType';
    const field = dimension === 'zone' ? 'locationZone' : 'propertyType';
    const groups = await prisma.property.groupBy({
      by: [field, 'status'],
      where: {
        ...propertyTenantWhere(ctx.tenantId),
        propertyType: input.propertyType,
        locationZone: input.zone ? { equals: input.zone, mode: 'insensitive' } : undefined
      },
      _count: { _all: true }
    });
    const counts = new Map<string | null, { total: number; occupied: number; available: number }>();
    const totals = { total: 0, occupied: 0, available: 0 };
    for (const group of groups) {
      const key = group[field];
      const row = counts.get(key) ?? { total: 0, occupied: 0, available: 0 };
      const count = group._count._all;
      row.total += count;
      totals.total += count;
      if (isOccupiedPropertyStatus(group.status)) {
        row.occupied += count;
        totals.occupied += count;
      }
      if (group.status === PropertyStatus.AVAILABLE) {
        row.available += count;
        totals.available += count;
      }
      counts.set(key, row);
    }
    const rows = [...counts]
      .map(([category, row]) => ({
        category,
        ...row,
        occupancy: propertyOccupancyRate(row.occupied, row.total)
      }))
      .sort((a, b) => b.total - a.total || String(a.category).localeCompare(String(b.category)));
    const tenantPath = '/tenant/' + encodeURIComponent(ctx.tenantId);
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Occupation du parc immobilier'),
      query: { ...input, tool: 'property_portfolio', groupBy: dimension },
      columns: [
        { key: 'category', label: dimension === 'zone' ? t('Zone') : t('Type de bien') },
        { key: 'total', label: t('Nombre de biens'), type: 'number' },
        { key: 'occupied', label: t('Biens occupés'), type: 'number' },
        { key: 'available', label: t('Biens disponibles'), type: 'number' },
        { key: 'occupancy', label: t('Taux d’occupation (%)'), type: 'number' }
      ],
      rows: rows.slice(0, maxRows),
      truncated: rows.length > maxRows,
      provenance: {
        source: t('Parc immobilier'),
        href: tenantPath + '/properties',
        period: now.slice(0, 10),
        calculatedAt: now,
        rules: [
          t(
            'Les biens loués ou vendus sont comptés comme occupés, selon la règle du tableau de bord. Tous les statuts entrent dans le total.'
          ),
          t('La disponibilité correspond au statut Disponible.'),
          ...(input.propertyType ? [t('Type de bien retenu : {{type}}', { type: input.propertyType })] : []),
          ...(input.zone ? [t('Zone retenue : {{zone}}', { zone: input.zone })] : [])
        ]
      }
    };
    return publish(artifact, rows, { ...totals, occupancy: propertyOccupancyRate(totals.occupied, totals.total) });
  }
};

const addDays = (day: string, n: number) => {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
};

export const leasePortfolioTool: CopilotToolDefinition<typeof leasesSchema> = {
  name: 'lease_portfolio',
  description:
    'Compte les baux au statut actif aujourd’hui et ceux qui se terminent dans une période inclusive, par bien. Les dates sont au format AAAA-MM-JJ. Par défaut, couvre les 30 prochains jours à compter d’aujourd’hui. Le filtre par bien attend un identifiant trouvé dans ImmoTopia. onlyEnding limite le tableau aux biens ayant au moins une fin de bail sur la période.',
  inputSchema: leasesSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      propertyId: { type: 'string', format: 'uuid' },
      start: { type: 'string', format: 'date' },
      end: { type: 'string', format: 'date' },
      onlyEnding: { type: 'boolean' }
    }
  },
  requiredPermission: leasePermission,
  additionalPermissions: [propertyPermission],
  feature: 'RENTAL',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, leasePermission);
    assertToolPermission(ctx, propertyPermission);
    const now = new Date().toISOString();
    const start = input.start ?? now.slice(0, 10);
    const end = input.end ?? addDays(start, 29);
    if (end < start) throw new BadRequestError(t('La date de fin doit être postérieure ou égale à la date de début.'));
    if (input.propertyId) await getPropertyForTenant(input.propertyId, ctx.tenantId);
    const where = {
      tenant_id: ctx.tenantId,
      property_id: input.propertyId,
      property: propertyTenantWhere(ctx.tenantId),
      status: RentalLeaseStatus.ACTIVE
    };
    const result = await prisma.rentalLease.findMany({
      where,
      select: { end_date: true, property: { select: { id: true, internalReference: true, title: true } } },
      take: 20_001
    });
    if (result.length > 20_000) throw new BadRequestError(t('Le volume des baux dépasse la limite de cette analyse.'));
    const rowsByProperty = new Map<
      string,
      { property: string; href: string; active: number; ending: number; firstEnd: string | null }
    >();
    const tenantPath = '/tenant/' + encodeURIComponent(ctx.tenantId);
    let ending = 0;
    for (const lease of result) {
      const property = lease.property;
      const row = rowsByProperty.get(property.id) ?? {
        property: [property.internalReference, property.title].filter(Boolean).join(' — '),
        href: tenantPath + '/properties/' + encodeURIComponent(property.id),
        active: 0,
        ending: 0,
        firstEnd: null
      };
      row.active++;
      const endDay = isoDay(lease.end_date);
      if (endDay && endDay >= start && endDay <= end) {
        row.ending++;
        ending++;
        if (!row.firstEnd || endDay < row.firstEnd) row.firstEnd = endDay;
      }
      rowsByProperty.set(property.id, row);
    }
    const rows = [...rowsByProperty.values()]
      .filter(row => !input.onlyEnding || row.ending > 0)
      .sort((a, b) => b.ending - a.ending || a.property.localeCompare(b.property));
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Baux actifs et fins de bail'),
      query: { ...input, tool: 'lease_portfolio', start, end },
      columns: [
        { key: 'property', label: t('Bien'), linkKey: 'href' },
        { key: 'active', label: t('Baux actifs'), type: 'number' },
        { key: 'ending', label: t('Baux se terminant dans la période'), type: 'number' },
        { key: 'firstEnd', label: t('Première fin de bail dans la période'), type: 'date' }
      ],
      rows: rows.slice(0, maxRows),
      truncated: rows.length > maxRows,
      provenance: {
        source: t('Baux de la gestion locative'),
        href: tenantPath + '/rental/leases?status=ACTIVE',
        period: start + ' – ' + end,
        calculatedAt: now,
        rules: [
          t('Le statut Actif est celui enregistré à la date du calcul.'),
          t(
            'Les dates de fin contractuelles sont comparées à la période affichée, bornes incluses. Les baux sans date de fin comptent dans les baux actifs.'
          ),
          ...(input.propertyId ? [t('Cette analyse est filtrée sur un seul bien.')] : []),
          ...(input.onlyEnding
            ? [t('Le tableau comprend uniquement les biens avec une fin de bail pendant la période.')]
            : [])
        ]
      }
    };
    return publish(artifact, rows, { active: result.length, ending });
  }
};
