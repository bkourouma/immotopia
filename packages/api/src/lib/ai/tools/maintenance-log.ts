import { randomUUID } from 'node:crypto';
import { MaintenanceLogCategory } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { BadRequestError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import { getPropertyForTenant, propertyTenantWhere } from '../../../utils/property-tenant-guard';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { COPILOT_ARTIFACT_MAX_ROWS, type AnalysisTable, type CopilotToolDefinition } from '../contracts';
import { closedMonthBounds } from './rental-arrears';
import { assertToolPermission, isoDay, outcome } from './tool-utils';

const permission = 'PROPERTIES_VIEW';
const inputSchema = z
  .object({
    propertyId: z.string().uuid().optional(),
    vendorId: z.string().uuid().optional(),
    category: z.nativeEnum(MaintenanceLogCategory).optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    overdueAsOf: z.string().date().optional()
  })
  .strict();
const dateProperty = { type: 'string', format: 'date' };

export const maintenanceLogTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'maintenance_log',
  description:
    'Consulte les interventions et coûts inscrits dans le carnet d’entretien des biens, avec catégorie, prestataire, devise et prochaine échéance. from/to filtrent la date d’intervention, par défaut le dernier mois clos. overdueAsOf sélectionne les échéances enregistrées avant cette date, sur toute la période antérieure en l’absence de from et to. Le carnet ne porte pas de statut de réalisation de la prochaine intervention.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      propertyId: { type: 'string', format: 'uuid' },
      vendorId: { type: 'string', format: 'uuid' },
      category: { type: 'string', enum: Object.values(MaintenanceLogCategory) },
      from: dateProperty,
      to: dateProperty,
      overdueAsOf: dateProperty
    }
  },
  requiredPermission: permission,
  feature: 'PATRIMOINE',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, permission);
    if (input.propertyId) await getPropertyForTenant(input.propertyId, ctx.tenantId);
    await assertBelongsToTenant(prisma, 'maintenanceVendor', input.vendorId, ctx.tenantId, {
      tenantField: 'tenant_id'
    });
    const now = new Date();
    const month = closedMonthBounds(undefined, now);
    const from = input.from ?? (input.overdueAsOf ? undefined : (input.to ?? month.start.toISOString().slice(0, 10)));
    const to =
      input.to ?? input.from ?? input.overdueAsOf ?? new Date(month.end.getTime() - 1).toISOString().slice(0, 10);
    if (from && to < from) throw new BadRequestError(t('La période demandée est invalide.'));
    const where = {
      tenantId: ctx.tenantId,
      property: propertyTenantWhere(ctx.tenantId),
      propertyId: input.propertyId,
      category: input.category,
      vendorId: input.vendorId,
      performedAt: {
        gte: from ? new Date(from + 'T00:00:00Z') : undefined,
        lt: new Date(Date.parse(to + 'T00:00:00Z') + 86_400_000)
      },
      ...(input.overdueAsOf ? { nextDueDate: { lt: new Date(input.overdueAsOf + 'T00:00:00Z') } } : {})
    };
    const entries = await prisma.maintenanceLogEntry.findMany({
      where,
      orderBy: input.overdueAsOf ? [{ nextDueDate: 'asc' }, { id: 'asc' }] : [{ performedAt: 'desc' }, { id: 'asc' }],
      take: COPILOT_ARTIFACT_MAX_ROWS + 1,
      select: {
        performedAt: true,
        category: true,
        vendor: { select: { name: true, tenant_id: true } },
        cost: true,
        currency: true,
        nextDueDate: true,
        property: { select: { id: true, title: true } }
      }
    });
    const href = `/tenant/${encodeURIComponent(ctx.tenantId)}/properties`;
    const labels: Record<MaintenanceLogCategory, string> = {
      PLUMBING: t('Plomberie'),
      ELECTRICAL: t('Électricité'),
      AIR_CONDITIONING: t('Climatisation'),
      GENERATOR: t('Groupe électrogène'),
      ROOF_WATERPROOFING: t('Toiture / étanchéité'),
      PAINTING: t('Peinture'),
      OTHER: t('Autre')
    };
    const rows = entries.slice(0, COPILOT_ARTIFACT_MAX_ROWS).map(row => ({
      property: row.property.title,
      href: `${href}/${encodeURIComponent(row.property.id)}?onglet=carnet`,
      category: labels[row.category],
      vendor: row.vendor?.tenant_id === ctx.tenantId ? row.vendor.name : null,
      performedAt: isoDay(row.performedAt),
      cost: row.cost?.toNumber() ?? null,
      currency: row.currency === 'FCFA' ? 'XOF' : row.currency,
      nextDueDate: isoDay(row.nextDueDate)
    }));
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Interventions et coûts du carnet d’entretien'),
      query: { tool: 'maintenance_log', ...input, from, to },
      columns: [
        { key: 'property', label: t('Bien'), linkKey: 'href' },
        { key: 'category', label: t('Catégorie') },
        { key: 'vendor', label: t('Prestataire') },
        { key: 'performedAt', label: t('Date d’intervention'), type: 'date' },
        { key: 'cost', label: t('Coût'), type: 'currency' },
        { key: 'currency', label: t('Devise') },
        { key: 'nextDueDate', label: t('Prochaine échéance'), type: 'date' }
      ],
      rows,
      truncated: entries.length > rows.length,
      provenance: {
        source: t('Carnet d’entretien'),
        href,
        period: from ? `${from} – ${to}` : t('Jusqu’au {{date}}', { date: to }),
        calculatedAt: now.toISOString(),
        rules: [
          t(
            'Les coûts viennent du carnet d’entretien. Un coût absent reste vide et chaque montant conserve sa devise.'
          ),
          ...(input.overdueAsOf
            ? [
                t(
                  'Échéances du carnet antérieures au {{date}}. Le carnet ne suit pas la réalisation de l’intervention suivante.',
                  { date: input.overdueAsOf }
                )
              ]
            : [])
        ]
      }
    };
    return outcome(
      { artifactId: artifact.id, items: rows.slice(0, 8), truncated: artifact.truncated },
      { type: 'artifact', artifact }
    );
  }
};
