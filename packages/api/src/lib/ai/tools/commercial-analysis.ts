import { randomUUID } from 'node:crypto';
import { ConstructionSiteStatus } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { BadRequestError, NotFoundError } from '../../../middleware/error-middleware';
import { getPipelineSummary, OPEN_CRM_STAGES } from '../../../services/crm-dashboard-service';
import { prisma } from '../../../utils/database';
import { getPropertyForTenant } from '../../../utils/property-tenant-guard';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { getSitesDashboard } from '../../finance/site-dashboard';
import { listMandates } from '../../sales/mandates';
import type { AnalysisTable, CopilotToolDefinition } from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const dealPermission = 'CRM_DEALS_VIEW';
const constructionPermission = 'FINANCE_REPORTS_READ';
const resourceId = { type: 'string', format: 'uuid' };
const datePattern = /^(?:[0-9]{4})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/;
const date = z
  .string()
  .regex(datePattern)
  .refine(value => {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });

async function assertActiveMember(tenantId: string, userId?: string): Promise<void> {
  if (!userId) return;
  const member = await prisma.membership.findFirst({
    where: { tenantId, userId, status: 'ACTIVE' },
    select: { id: true }
  });
  if (!member) throw new NotFoundError(t('Collaborateur introuvable.'));
}

const crmSchema = z
  .object({
    assignedToUserId: z.string().uuid().optional(),
    stages: z.array(z.enum(OPEN_CRM_STAGES)).min(1).max(4).optional()
  })
  .strict();

export const crmPipelineTool: CopilotToolDefinition<typeof crmSchema> = {
  name: 'crm_pipeline',
  description:
    'Analyse les affaires ouvertes du pipeline CRM par étape, avec nombre, valeur attendue, âge moyen et part. Peut filtrer les étapes ouvertes et le collaborateur assigné (identifiant vérifié).',
  inputSchema: crmSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      assignedToUserId: resourceId,
      stages: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', enum: OPEN_CRM_STAGES } }
    }
  },
  requiredPermission: dealPermission,
  feature: 'CRM',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, dealPermission);
    await assertActiveMember(ctx.tenantId, input.assignedToUserId);
    const now = new Date();
    const stages = input.stages ? [...new Set(input.stages)] : undefined;
    const summary = await getPipelineSummary(ctx.tenantId, input.assignedToUserId, stages, now);
    const labels = {
      NEW: t('Nouveau'),
      QUALIFIED: t('Qualifié'),
      VISIT: t('Visite'),
      NEGOTIATION: t('Négociation'),
      WON: t('Gagné'),
      LOST: t('Perdu')
    };
    const rows = summary.stages.map(row => ({ ...row, stage: labels[row.stage], currency: 'XOF' }));
    const title = t('Pipeline des affaires');
    const dashboardAccess = ctx.permissions.has('CRM_CONTACTS_VIEW');
    const crmPath = `/tenant/${encodeURIComponent(ctx.tenantId)}/crm`;
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title,
      query: { tool: 'crm_pipeline', ...input, stages },
      columns: [
        { key: 'stage', label: t('Étape') },
        { key: 'count', label: t('Nombre d’affaires'), type: 'number' },
        { key: 'value', label: t('Valeur attendue'), type: 'currency' },
        { key: 'currency', label: t('Devise') },
        { key: 'avgAgeDays', label: t('Âge moyen en jours'), type: 'number' },
        { key: 'percentage', label: t('Part des affaires (%)'), type: 'number' }
      ],
      rows,
      provenance: {
        source: dashboardAccess ? t('Tableau de bord CRM') : title,
        href: dashboardAccess ? crmPath + '/dashboard' : crmPath + '/deals',
        period: now.toISOString().slice(0, 10),
        calculatedAt: now.toISOString(),
        rules: [
          t('Les affaires gagnées et perdues sont exclues, comme dans le tableau de bord CRM.'),
          t('La valeur attendue reprend les montants du CRM en XOF. La part est calculée parmi les étapes retenues.'),
          ...(input.assignedToUserId ? [t('Les résultats couvrent uniquement le collaborateur sélectionné.')] : [])
        ]
      }
    };
    return outcome(
      { artifactId: artifact.id, count: summary.total, totalValue: summary.totalValue, currency: 'XOF', rows },
      { type: 'artifact', artifact }
    );
  }
};

const mandateSchema = z
  .object({
    start: date.optional(),
    end: date.optional(),
    propertyId: z.string().uuid().optional(),
    agentUserId: z.string().uuid().optional()
  })
  .strict();

export const saleMandatesTool: CopilotToolDefinition<typeof mandateSchema> = {
  name: 'sale_mandates',
  description:
    'Liste les mandats de vente au statut actif dont la date de fin tombe dans la période inclusive. Par défaut, couvre les 30 prochains jours. Filtres possibles par bien et négociateur vérifiés.',
  inputSchema: mandateSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      start: { type: 'string', format: 'date' },
      end: { type: 'string', format: 'date' },
      propertyId: resourceId,
      agentUserId: resourceId
    }
  },
  requiredPermission: dealPermission,
  feature: 'SALES',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, dealPermission);
    if (input.propertyId) await getPropertyForTenant(input.propertyId, ctx.tenantId);
    await assertActiveMember(ctx.tenantId, input.agentUserId);
    const now = new Date();
    const start = input.start ?? now.toISOString().slice(0, 10);
    const end = input.end ?? new Date(new Date(start).getTime() + 30 * 86_400_000).toISOString().split('T')[0];
    if (!date.safeParse(end).success || end < start) throw new BadRequestError(t('La période demandée est invalide.'));
    const page = await listMandates(ctx.tenantId, {
      status: 'ACTIVE',
      endFrom: start,
      endTo: end,
      propertyId: input.propertyId,
      agentUserId: input.agentUserId,
      page: 1,
      limit: 100
    });
    const tenantPath = `/tenant/${encodeURIComponent(ctx.tenantId)}/sales/mandates`;
    const items = Array.isArray(page) ? page : page.items;
    const total = Array.isArray(page) ? page.length : page.total;
    const rows = items.map(row => ({
      mandate: row.number,
      href: `${tenantPath}/${row.id}`,
      property: row.propertyLabel,
      agent: row.agentName,
      start: row.startDate.slice(0, 10),
      end: row.endDate?.slice(0, 10) ?? null,
      askingPrice: row.askingPrice,
      currency: 'XOF'
    }));
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Échéances des mandats de vente'),
      query: { tool: 'sale_mandates', ...input, start, end },
      columns: [
        { key: 'mandate', label: t('Mandat'), linkKey: 'href' },
        { key: 'property', label: t('Bien') },
        { key: 'agent', label: t('Négociateur') },
        { key: 'start', label: t('Date de début'), type: 'date' },
        { key: 'end', label: t('Date de fin'), type: 'date' },
        { key: 'askingPrice', label: t('Prix demandé'), type: 'currency' },
        { key: 'currency', label: t('Devise') }
      ],
      rows,
      truncated: total > rows.length,
      provenance: {
        source: t('Mandats de vente'),
        href: tenantPath,
        period: `${start} – ${end}`,
        calculatedAt: now.toISOString(),
        rules: [
          t('Seuls les mandats au statut actif dont la date de fin est comprise dans la période sont retenus.'),
          ...(input.propertyId ? [t('Les résultats couvrent uniquement le bien sélectionné.')] : []),
          ...(input.agentUserId ? [t('Les résultats couvrent uniquement le négociateur sélectionné.')] : [])
        ]
      }
    };
    return outcome(
      { artifactId: artifact.id, count: total, rows: rows.slice(0, 10), truncated: artifact.truncated },
      { type: 'artifact', artifact }
    );
  }
};

const siteSchema = z
  .object({
    siteId: z.string().uuid().optional(),
    status: z.nativeEnum(ConstructionSiteStatus).optional(),
    onlyOverBudget: z.boolean().optional()
  })
  .strict();

export const constructionBudgetTool: CopilotToolDefinition<typeof siteSchema> = {
  name: 'construction_budget',
  description:
    'Présente le budget révisé, le réalisé, l’engagé, l’écart et l’avancement actuels des chantiers selon le tableau de bord. Peut filtrer sur un chantier, un statut ou les dépassements. Ne reconstitue pas un budget historique.',
  inputSchema: siteSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      siteId: resourceId,
      status: { type: 'string', enum: Object.values(ConstructionSiteStatus) },
      onlyOverBudget: { type: 'boolean' }
    }
  },
  requiredPermission: constructionPermission,
  feature: 'CONSTRUCTION',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, constructionPermission);
    await assertBelongsToTenant(prisma, 'constructionSite', input.siteId, ctx.tenantId, {
      message: t('Chantier introuvable.')
    });
    const now = new Date().toISOString();
    const result = await getSitesDashboard(ctx.tenantId, input);
    const labels: Record<string, string> = {
      PLANNED: t('Planifié'),
      IN_PROGRESS: t('En cours'),
      SUSPENDED: t('Suspendu'),
      CLOSED: t('Clôturé')
    };
    const base = `/tenant/${encodeURIComponent(ctx.tenantId)}/finance`;
    const dashboard = base + '/tableau-de-bord-chantiers';
    const rows = result.rows.slice(0, 500).map(row => ({
      site: row.siteLabel,
      href: ctx.permissions.has('FINANCE_ACCOUNTS_READ') ? `${base}/chantiers/${row.siteId}/budget` : dashboard,
      zone: row.zone,
      status: labels[row.status] ?? row.status,
      initialBudget: row.initialBudget,
      revisedBudget: row.revisedBudget,
      actualCost: row.actualCost,
      engagedAmount: row.engagedAmount,
      variance: row.variance,
      progress: row.progressPercent,
      currency: row.currency
    }));
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Suivi budgétaire des chantiers'),
      query: { tool: 'construction_budget', ...input },
      columns: [
        { key: 'site', label: t('Chantier'), linkKey: 'href' },
        { key: 'zone', label: t('Zone') },
        { key: 'status', label: t('Statut') },
        { key: 'initialBudget', label: t('Budget initial'), type: 'currency' },
        { key: 'revisedBudget', label: t('Budget révisé'), type: 'currency' },
        { key: 'actualCost', label: t('Réalisé'), type: 'currency' },
        { key: 'engagedAmount', label: t('Engagé'), type: 'currency' },
        { key: 'variance', label: t('Écart'), type: 'currency' },
        { key: 'progress', label: t('Avancement (%)'), type: 'number' },
        { key: 'currency', label: t('Devise') }
      ],
      rows,
      truncated: result.rows.length > rows.length,
      provenance: {
        source: t('Tableau de bord des chantiers'),
        href: dashboard,
        period: now.slice(0, 10),
        calculatedAt: now,
        rules: [
          t('L’écart est le budget révisé moins l’engagé selon le tableau de bord du chantier.'),
          t('Sans budget validé, le budget et l’écart restent non renseignés.'),
          ...(input.onlyOverBudget ? [t('Seuls les chantiers dont l’écart est négatif sont affichés.')] : [])
        ]
      }
    };
    return outcome(
      { artifactId: artifact.id, count: result.rows.length, rows: rows.slice(0, 10), truncated: artifact.truncated },
      { type: 'artifact', artifact }
    );
  }
};
