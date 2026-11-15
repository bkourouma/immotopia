import { randomUUID } from 'node:crypto';
import { MaintenanceTicketPriority, MaintenanceTicketStatus } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { BadRequestError, NotFoundError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import {
  isOpenMaintenanceOverdue,
  OPEN_TICKET_STATUSES,
  startOfMaintenanceDay
} from '../../../utils/maintenance-ticket-status';
import { getPropertyForTenant, propertyTenantWhere } from '../../../utils/property-tenant-guard';
import {
  COPILOT_ARTIFACT_MAX_ROWS,
  type AnalysisTable,
  type CopilotToolContext,
  type CopilotToolDefinition
} from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const permission = 'MAINTENANCE_ADMIN';
const maxTickets = 20_000;
const dayMs = 86_400_000;
const inputSchema = z
  .object({
    propertyId: z.string().uuid().optional(),
    vendorId: z.string().uuid().optional(),
    priority: z.nativeEnum(MaintenanceTicketPriority).optional(),
    status: z.nativeEnum(MaintenanceTicketStatus).optional(),
    onlyOverdue: z.boolean().optional()
  })
  .strict();

export const maintenanceOverviewTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'maintenance_overview',
  description:
    'Analyse les tickets actuels par statut et priorité, dont les tickets ouverts dont la date contractuelle est dépassée. onlyOverdue liste ces tickets individuellement. Filtres facultatifs par bien, prestataire, priorité ou statut.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      propertyId: { type: 'string', format: 'uuid' },
      vendorId: { type: 'string', format: 'uuid' },
      priority: { type: 'string', enum: Object.values(MaintenanceTicketPriority) },
      status: { type: 'string', enum: Object.values(MaintenanceTicketStatus) },
      onlyOverdue: { type: 'boolean' }
    }
  },
  requiredPermission: permission,
  feature: 'CORE',
  kind: 'read',
  execute: analyzeMaintenance
};

const syndicateInputSchema = inputSchema.extend({ syndicateId: z.string().uuid() });
export const syndicateMaintenanceTool: CopilotToolDefinition<typeof syndicateInputSchema> = {
  ...maintenanceOverviewTool,
  name: 'syndicate_maintenance',
  description:
    'Analyse les tickets liés à une copropriété. Utilise son identifiant trouvé dans ImmoTopia. Accepte les filtres bien, prestataire, statut et priorité. onlyOverdue liste les tickets ouverts dont la date contractuelle est dépassée.',
  inputSchema: syndicateInputSchema,
  jsonSchema: {
    ...maintenanceOverviewTool.jsonSchema,
    required: ['syndicateId'],
    properties: {
      ...(maintenanceOverviewTool.jsonSchema.properties as object),
      syndicateId: { type: 'string', format: 'uuid' }
    }
  },
  additionalPermissions: ['SYNDIC_VIEW'],
  feature: 'SYNDIC',
  execute: analyzeMaintenance
};

async function analyzeMaintenance(
  input: z.infer<typeof inputSchema> & { syndicateId?: string },
  ctx: CopilotToolContext
) {
  assertToolPermission(ctx, permission);
  const syndicateId = input.syndicateId;
  let syndicate: { name: string } | null = null;
  if (syndicateId) {
    assertToolPermission(ctx, 'SYNDIC_VIEW');
    syndicate = await prisma.syndicate.findFirst({
      where: { id: syndicateId, tenantId: ctx.tenantId },
      select: { name: true }
    });
    if (!syndicate) throw new NotFoundError();
  }
  if (input.propertyId) await getPropertyForTenant(input.propertyId, ctx.tenantId);
  if (
    input.vendorId &&
    !(await prisma.maintenanceVendor.findFirst({
      where: { id: input.vendorId, tenant_id: ctx.tenantId },
      select: { id: true }
    }))
  )
    throw new NotFoundError();
  const now = new Date();
  const today = startOfMaintenanceDay(now);
  const tickets = await prisma.maintenanceTicket.findMany({
    where: {
      tenant_id: ctx.tenantId,
      property: propertyTenantWhere(ctx.tenantId),
      property_id: input.propertyId,
      assigned_vendor_id: input.vendorId,
      priority: input.priority,
      status: input.status,
      ...(input.onlyOverdue
        ? { AND: [{ status: { in: OPEN_TICKET_STATUSES }, contract_due_date: { lt: today } }] }
        : {}),
      ...(syndicateId ? { syndicateLink: { is: { syndicateId, syndicate: { tenantId: ctx.tenantId } } } } : {})
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      declared_at: true,
      resolved_at: true,
      contract_due_date: true,
      property: { select: { title: true } }
    },
    orderBy: input.onlyOverdue ? [{ contract_due_date: 'asc' }, { id: 'asc' }] : undefined,
    take: (input.onlyOverdue ? COPILOT_ARTIFACT_MAX_ROWS : maxTickets) + 1
  });
  if (tickets.length > maxTickets)
    throw new BadRequestError(t('Le volume des tickets dépasse la limite de cette analyse.'));
  const groups = new Map<
    string,
    {
      status: MaintenanceTicketStatus;
      priority: MaintenanceTicketPriority;
      count: number;
      open: number;
      openDays: number;
      overdue: number;
      withoutDeadline: number;
      resolved: number;
      resolutionDays: number;
    }
  >();
  let open = 0;
  let urgent = 0;
  let overdue = 0;
  for (const ticket of tickets) {
    const { status, priority } = ticket;
    const key = status + '/' + priority;
    const group = groups.get(key) ?? {
      status,
      priority,
      count: 0,
      open: 0,
      openDays: 0,
      overdue: 0,
      withoutDeadline: 0,
      resolved: 0,
      resolutionDays: 0
    };
    group.count++;
    if (OPEN_TICKET_STATUSES.includes(status)) {
      group.open++;
      group.openDays += Math.max(0, now.getTime() - ticket.declared_at.getTime()) / dayMs;
      open++;
      if (priority === MaintenanceTicketPriority.URGENT) urgent++;
      if (isOpenMaintenanceOverdue(status, ticket.contract_due_date, today)) {
        group.overdue++;
        overdue++;
      }
      if (!ticket.contract_due_date) group.withoutDeadline++;
    }
    if (status === MaintenanceTicketStatus.RESOLVED && ticket.resolved_at && ticket.resolved_at >= ticket.declared_at) {
      group.resolved++;
      group.resolutionDays += (ticket.resolved_at.getTime() - ticket.declared_at.getTime()) / dayMs;
    }
    groups.set(key, group);
  }
  const summaryRows = [...groups.values()]
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status) || a.priority.localeCompare(b.priority))
    .map(group => ({
      status: group.status,
      priority: group.priority,
      count: group.count,
      open: group.open,
      urgent: group.priority === MaintenanceTicketPriority.URGENT ? group.open : 0,
      overdue: group.overdue,
      withoutDeadline: group.withoutDeadline,
      averageAge: group.open ? Math.round((group.openDays / group.open) * 10) / 10 : null,
      averageResolution: group.resolved ? Math.round((group.resolutionDays / group.resolved) * 10) / 10 : null
    }));
  const period = now.toISOString().slice(0, 10);
  const href = '/tenant/' + encodeURIComponent(ctx.tenantId) + '/admin/maintenance/tickets';
  const rows = input.onlyOverdue
    ? tickets.slice(0, COPILOT_ARTIFACT_MAX_ROWS).map(ticket => ({
        ticket: ticket.title,
        href: `${href}/${encodeURIComponent(ticket.id)}`,
        property: ticket.property.title,
        status: ticket.status,
        priority: ticket.priority,
        contractDueDate: ticket.contract_due_date?.toISOString().slice(0, 10) ?? null
      }))
    : summaryRows;
  const artifact: AnalysisTable = {
    kind: 'table',
    id: randomUUID(),
    title: input.onlyOverdue ? t('Tickets de maintenance en retard') : t('Suivi des tickets de maintenance'),
    query: syndicateId
      ? { ...input, tool: 'syndicate_maintenance', syndicateId }
      : { ...input, tool: 'maintenance_overview' },
    columns: input.onlyOverdue
      ? [
          { key: 'ticket', label: t('Ticket'), linkKey: 'href' },
          { key: 'property', label: t('Bien') },
          { key: 'status', label: t('Statut') },
          { key: 'priority', label: t('Priorité') },
          { key: 'contractDueDate', label: t('Échéance contractuelle'), type: 'date' }
        ]
      : [
          { key: 'status', label: t('Statut') },
          { key: 'priority', label: t('Priorité') },
          { key: 'count', label: t('Nombre de tickets'), type: 'number' },
          { key: 'open', label: t('Tickets ouverts'), type: 'number' },
          { key: 'urgent', label: t('Tickets urgents ouverts'), type: 'number' },
          { key: 'overdue', label: t('Tickets en retard'), type: 'number' },
          { key: 'withoutDeadline', label: t('Tickets ouverts sans échéance'), type: 'number' },
          { key: 'averageAge', label: t('Ancienneté moyenne des tickets ouverts (jours)'), type: 'number' },
          { key: 'averageResolution', label: t('Délai moyen de résolution (jours)'), type: 'number' }
        ],
    rows,
    truncated: input.onlyOverdue === true && tickets.length > rows.length,
    provenance: {
      source: t('Maintenance'),
      href,
      period,
      calculatedAt: now.toISOString(),
      rules: [
        t(
          'Les tickets déclarés, assignés et en cours sont ouverts. Les tickets urgents comptés sont ceux qui restent ouverts.'
        ),
        t(
          'L’ancienneté part de la déclaration. Le délai de résolution utilise les dates enregistrées des tickets résolus.'
        ),
        t(
          'Un ticket ouvert est en retard à partir du lendemain de son échéance contractuelle, en UTC. Les tickets ouverts sans échéance sont comptés à part.'
        ),
        ...(syndicate ? [t('Copropriété retenue : {{name}}', { name: syndicate.name })] : []),
        ...(input.propertyId ? [t('Cette analyse est filtrée sur un seul bien.')] : []),
        ...(input.vendorId ? [t('Cette analyse est filtrée sur un seul prestataire.')] : []),
        ...(input.status ? [t('Statut filtré : {{value}}', { value: input.status })] : []),
        ...(input.priority ? [t('Priorité filtrée : {{value}}', { value: input.priority })] : [])
      ]
    }
  };
  return outcome(
    {
      artifactId: artifact.id,
      ...(artifact.truncated ? { truncated: true } : { total: tickets.length, open, urgent, overdue }),
      columns: artifact.columns.map(column => column.key),
      items: rows.slice(0, 8)
    },
    { type: 'artifact', artifact }
  );
}
