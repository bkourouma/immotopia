import { randomUUID } from 'node:crypto';
import { MaintenanceTicketPriority, MaintenanceTicketStatus } from '@prisma/client';
import { z } from 'zod';
import { t } from '../../../i18n';
import { BadRequestError, NotFoundError } from '../../../middleware/error-middleware';
import { prisma } from '../../../utils/database';
import { OPEN_TICKET_STATUSES } from '../../../utils/maintenance-ticket-status';
import { getPropertyForTenant, propertyTenantWhere } from '../../../utils/property-tenant-guard';
import type { AnalysisTable, CopilotToolDefinition } from '../contracts';
import { assertToolPermission, outcome } from './tool-utils';

const permission = 'MAINTENANCE_ADMIN';
const maxTickets = 20_000;
const dayMs = 86_400_000;
const inputSchema = z
  .object({
    propertyId: z.string().uuid().optional(),
    vendorId: z.string().uuid().optional(),
    priority: z.nativeEnum(MaintenanceTicketPriority).optional(),
    status: z.nativeEnum(MaintenanceTicketStatus).optional()
  })
  .strict();

export const maintenanceOverviewTool: CopilotToolDefinition<typeof inputSchema> = {
  name: 'maintenance_overview',
  description:
    'Analyse les tickets de maintenance actuels par statut et priorité. Compte les tickets ouverts et urgents, mesure leur ancienneté moyenne et le délai moyen des tickets résolus. Filtres facultatifs par bien, prestataire, priorité ou statut.',
  inputSchema,
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      propertyId: { type: 'string', format: 'uuid' },
      vendorId: { type: 'string', format: 'uuid' },
      priority: { type: 'string', enum: Object.values(MaintenanceTicketPriority) },
      status: { type: 'string', enum: Object.values(MaintenanceTicketStatus) }
    }
  },
  requiredPermission: permission,
  feature: 'CORE',
  kind: 'read',
  async execute(input, ctx) {
    assertToolPermission(ctx, permission);
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
    const tickets = await prisma.maintenanceTicket.findMany({
      where: {
        tenant_id: ctx.tenantId,
        property: propertyTenantWhere(ctx.tenantId),
        property_id: input.propertyId,
        assigned_vendor_id: input.vendorId,
        priority: input.priority,
        status: input.status
      },
      select: { status: true, priority: true, declared_at: true, resolved_at: true },
      take: maxTickets + 1
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
        resolved: number;
        resolutionDays: number;
      }
    >();
    let open = 0;
    let urgent = 0;
    for (const ticket of tickets) {
      const { status, priority } = ticket;
      const key = status + '/' + priority;
      const group = groups.get(key) ?? {
        status,
        priority,
        count: 0,
        open: 0,
        openDays: 0,
        resolved: 0,
        resolutionDays: 0
      };
      group.count++;
      if (OPEN_TICKET_STATUSES.includes(status)) {
        group.open++;
        group.openDays += Math.max(0, now.getTime() - ticket.declared_at.getTime()) / dayMs;
        open++;
        if (priority === MaintenanceTicketPriority.URGENT) urgent++;
      }
      if (
        status === MaintenanceTicketStatus.RESOLVED &&
        ticket.resolved_at &&
        ticket.resolved_at >= ticket.declared_at
      ) {
        group.resolved++;
        group.resolutionDays += (ticket.resolved_at.getTime() - ticket.declared_at.getTime()) / dayMs;
      }
      groups.set(key, group);
    }
    const rows = [...groups.values()]
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status) || a.priority.localeCompare(b.priority))
      .map(group => ({
        status: group.status,
        priority: group.priority,
        count: group.count,
        open: group.open,
        urgent: group.priority === MaintenanceTicketPriority.URGENT ? group.open : 0,
        averageAge: group.open ? Math.round((group.openDays / group.open) * 10) / 10 : null,
        averageResolution: group.resolved ? Math.round((group.resolutionDays / group.resolved) * 10) / 10 : null
      }));
    const period = now.toISOString().slice(0, 10);
    const artifact: AnalysisTable = {
      kind: 'table',
      id: randomUUID(),
      title: t('Suivi des tickets de maintenance'),
      query: { tool: 'maintenance_overview', ...input },
      columns: [
        { key: 'status', label: t('Statut') },
        { key: 'priority', label: t('Priorité') },
        { key: 'count', label: t('Nombre de tickets'), type: 'number' },
        { key: 'open', label: t('Tickets ouverts'), type: 'number' },
        { key: 'urgent', label: t('Tickets urgents ouverts'), type: 'number' },
        { key: 'averageAge', label: t('Ancienneté moyenne des tickets ouverts (jours)'), type: 'number' },
        { key: 'averageResolution', label: t('Délai moyen de résolution (jours)'), type: 'number' }
      ],
      rows,
      provenance: {
        source: t('Maintenance'),
        href: '/tenant/' + encodeURIComponent(ctx.tenantId) + '/admin/maintenance/tickets',
        period,
        calculatedAt: now.toISOString(),
        rules: [
          t(
            'Les tickets déclarés, assignés et en cours sont ouverts. Les tickets urgents comptés sont ceux qui restent ouverts.'
          ),
          t(
            'L’ancienneté part de la déclaration. Le délai de résolution utilise les dates enregistrées des tickets résolus.'
          ),
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
        total: tickets.length,
        open,
        urgent,
        columns: artifact.columns.map(column => column.key),
        items: rows.slice(0, 8)
      },
      { type: 'artifact', artifact }
    );
  }
};
