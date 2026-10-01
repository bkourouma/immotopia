import { prisma } from '../utils/database';
import { AuditLogEntry, AuditActionKey } from '../types/audit-types';
import { logger } from '../utils/logger';
import { registerShutdownHook } from '../utils/shutdown-hooks';
import { AuditRow, buildAuditRow } from './audit-entry-builder';

// In-memory audit queue. Rows are built (actor, tenant, request id, catalog,
// redaction) when the event is logged, i.e. inside the request: the flush runs
// from a timer, outside any request context.
const auditQueue: AuditRow[] = [];
let flushInterval: NodeJS.Timeout | null = null;

// Queue flush threshold
const QUEUE_FLUSH_THRESHOLD = 100;
const QUEUE_FLUSH_INTERVAL_MS = 5000; // 5 seconds

// Hard cap: while the database is down the queue would otherwise grow without
// bound and take the process down with it. Oldest rows are dropped first.
export const AUDIT_QUEUE_MAX = 10_000;

function capQueue(): void {
  const overflow = auditQueue.length - AUDIT_QUEUE_MAX;
  if (overflow > 0) {
    auditQueue.splice(0, overflow);
    logger.error('Audit queue overflow: oldest events dropped', { dropped: overflow, max: AUDIT_QUEUE_MAX });
  }
}

/**
 * Add audit log entry (non-blocking, best effort: up to a few seconds of events
 * can be lost on a hard crash). Use `recordAuditEvent` inside the business
 * transaction for actions that must never go unrecorded.
 *
 * Actor, agency, request id, IP and User-Agent are filled from the current
 * request context when the caller does not provide them.
 * @param entry - Audit log entry
 */
export function logAuditEvent(entry: AuditLogEntry): void {
  auditQueue.push(buildAuditRow(entry));
  capQueue();

  // Auto-flush if queue reaches threshold
  if (auditQueue.length >= QUEUE_FLUSH_THRESHOLD) {
    flushAuditQueue().catch(error => {
      logger.error('Error flushing audit queue (threshold)', { error });
    });
  } else if (!flushInterval) {
    // Start periodic flush if not already running
    flushInterval = setInterval(() => {
      flushAuditQueue().catch(error => {
        logger.error('Error flushing audit queue (interval)', { error });
      });
    }, QUEUE_FLUSH_INTERVAL_MS);
  }
}

/** Minimal shape of a Prisma client or transaction client that can write audit rows. */
export interface AuditWriter {
  auditLog: { create: (args: { data: AuditRow }) => Promise<unknown> };
}

/**
 * Write an audit event through the given transaction client, in the same
 * transaction as the business change. If the audit row cannot be written the
 * transaction fails: no commit without its trace. Reserved for the actions
 * flagged `critical` in `types/audit-catalog.ts`.
 *
 * The row is built here, at call time, so the request context is still
 * available.
 */
export async function recordAuditEvent(tx: AuditWriter, entry: AuditLogEntry): Promise<void> {
  await tx.auditLog.create({ data: buildAuditRow(entry) });
}

/**
 * Flush queue to database (batch insert)
 */
async function flushAuditQueue(): Promise<void> {
  if (auditQueue.length === 0) {
    return;
  }

  const entries = auditQueue.splice(0, auditQueue.length);

  try {
    await prisma.auditLog.createMany({
      data: entries,
      skipDuplicates: true
    });

    logger.debug('Audit log queue flushed', { count: entries.length });
  } catch (error) {
    // Re-queue failed entries, ahead of the ones logged meanwhile; the cap
    // bounds the retry.
    logger.error('Audit log flush failed, re-queuing entries', {
      error,
      entryCount: entries.length
    });
    auditQueue.unshift(...entries);
    capQueue();
  }

  // Clear interval if queue is empty
  if (auditQueue.length === 0 && flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
}

/**
 * Vide la file en memoire (reutilise `flushAuditQueue`) et renvoie le nombre
 * d'entrees restees en file (0 = tout ecrit). A appeler avant qu'un script
 * court (CLI, tache) ne quitte le process : sans cela, les evenements posés
 * juste avant la fin ne partiraient jamais (le flush periodique est a 5 s).
 */
export async function flushAuditEvents(): Promise<number> {
  await flushAuditQueue();
  return auditQueue.length;
}

/**
 * Get audit logs with filtering
 * @param filters - Filter criteria
 * @returns Audit logs and pagination info
 */
export async function getAuditLogs(filters: {
  tenantId?: string;
  actionKey?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}) {
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const skip = (page - 1) * limit;

  const where: any = {};

  if (filters.tenantId) {
    where.tenantId = filters.tenantId;
  }
  if (filters.actionKey) {
    where.actionKey = filters.actionKey;
  }
  if (filters.entityType) {
    where.entityType = filters.entityType;
  }
  if (filters.entityId) {
    where.entityId = filters.entityId;
  }
  if (filters.actorUserId) {
    where.actorUserId = filters.actorUserId;
  }
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.createdAt.lte = filters.endDate;
    }
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc'
      }
    }),
    prisma.auditLog.count({ where })
  ]);

  // AuditLog no longer carries foreign keys to users/tenants, so that a
  // deleted user or tenant cannot erase who did what. Resolve the labels in a
  // second query instead — two round-trips, not one per row.
  const actorIds = [...new Set(rows.map(r => r.actorUserId).filter((id): id is string => Boolean(id)))];
  const tenantIds = [...new Set(rows.map(r => r.tenantId).filter((id): id is string => Boolean(id)))];

  const [actors, tenants] = await Promise.all([
    actorIds.length
      ? prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true, fullName: true }
        })
      : Promise.resolve([]),
    tenantIds.length
      ? prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true }
        })
      : Promise.resolve([])
  ]);

  const actorById = new Map(actors.map(a => [a.id, a]));
  const tenantById = new Map(tenants.map(t => [t.id, t]));

  // Keep the previous response shape: null means the referenced entity is gone,
  // while the id itself is still on the log line.
  const logs = rows.map(row => ({
    ...row,
    actor: row.actorUserId ? (actorById.get(row.actorUserId) ?? null) : null,
    tenant: row.tenantId ? (tenantById.get(row.tenantId) ?? null) : null
  }));

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Enrich audit logs with human-readable resource labels by fetching actual entity data.
 * Same kind of display as in the app (e.g. property ref + title + address, lease number, contact name).
 */
export async function enrichAuditLogsWithResourceLabels(
  logs: Array<{
    id: string;
    entityType: string;
    entityId: string;
    tenantId: string | null;
    payload?: unknown;
  }>
): Promise<Map<string, string>> {
  const labelByLogId = new Map<string, string>();
  if (logs.length === 0) return labelByLogId;

  const propIds = new Set<string>();
  const leaseIds = new Set<string>();
  const contactIds = new Set<string>();
  const dealIds = new Set<string>();
  const tenantIds = new Set<string>();
  const invoiceIds = new Set<string>();
  const vendorIds = new Set<string>();
  const ticketIds = new Set<string>();

  for (const log of logs) {
    const et = log.entityType;
    if (et === 'PROPERTY' || et === 'Property') propIds.add(log.entityId);
    else if (et === 'RENTAL_LEASE') leaseIds.add(log.entityId);
    else if (et === 'CONTACT' || et === 'Contact') contactIds.add(log.entityId);
    else if (et === 'DEAL' || et === 'CrmDeal') dealIds.add(log.entityId);
    else if (et === 'Tenant') tenantIds.add(log.entityId);
    else if (et === 'Invoice') invoiceIds.add(log.entityId);
    else if (et === 'MaintenanceVendor' || et === 'MAINTENANCE_VENDOR') vendorIds.add(log.entityId);
    else if (et === 'MaintenanceTicket' || et === 'MAINTENANCE_TICKET') ticketIds.add(log.entityId);
  }

  const [properties, leases, contacts, deals, tenants, invoices, maintenanceVendors, serviceProviders, tickets] =
    await Promise.all([
      propIds.size > 0
        ? prisma.property.findMany({
            where: { id: { in: [...propIds] } },
            select: { id: true, internalReference: true, title: true, address: true }
          })
        : [],
      leaseIds.size > 0
        ? prisma.rentalLease.findMany({
            where: { id: { in: [...leaseIds] } },
            select: {
              id: true,
              lease_number: true,
              property: { select: { internalReference: true, title: true, address: true } }
            }
          })
        : [],
      contactIds.size > 0
        ? prisma.crmContact.findMany({
            where: { id: { in: [...contactIds] } },
            select: { id: true, firstName: true, lastName: true, email: true, legalName: true }
          })
        : [],
      dealIds.size > 0
        ? prisma.crmDeal.findMany({
            where: { id: { in: [...dealIds] } },
            select: {
              id: true,
              type: true,
              stage: true,
              contact: { select: { firstName: true, lastName: true, email: true } }
            }
          })
        : [],
      tenantIds.size > 0
        ? prisma.tenant.findMany({
            where: { id: { in: [...tenantIds] } },
            select: { id: true, name: true }
          })
        : [],
      invoiceIds.size > 0
        ? prisma.invoice.findMany({
            where: { id: { in: [...invoiceIds] } },
            select: { id: true, invoiceNumber: true }
          })
        : [],
      vendorIds.size > 0
        ? prisma.maintenanceVendor.findMany({
            where: { id: { in: [...vendorIds] } },
            select: { id: true, name: true }
          })
        : [],
      vendorIds.size > 0
        ? prisma.serviceProvider.findMany({
            where: { id: { in: [...vendorIds] } },
            select: { id: true, name: true }
          })
        : [],
      ticketIds.size > 0
        ? prisma.maintenanceTicket.findMany({
            where: { id: { in: [...ticketIds] } },
            select: { id: true, title: true, category: true }
          })
        : []
    ]);

  const propMap = new Map(
    properties.map(p => [p.id, [p.internalReference, p.title, p.address].filter(Boolean).join(' – ') || p.id])
  );
  const leaseMap = new Map(
    leases.map(l => {
      const propPart = l.property
        ? [l.property.internalReference, l.property.title].filter(Boolean).join(' – ') || l.property.address
        : '';
      const label = propPart ? `Bail n° ${l.lease_number} – ${propPart}` : `Bail n° ${l.lease_number}`;
      return [l.id, label];
    })
  );
  const contactMap = new Map(
    contacts.map(c => {
      const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.legalName || c.email || c.id;
      return [c.id, name];
    })
  );
  const dealMap = new Map(
    deals.map(d => {
      const contactPart = d.contact
        ? [d.contact.firstName, d.contact.lastName].filter(Boolean).join(' ') || d.contact.email
        : '';
      const label = contactPart ? `Affaire ${d.type} – ${contactPart}` : `Affaire ${d.type}`;
      return [d.id, label];
    })
  );
  const tenantMap = new Map(tenants.map(t => [t.id, t.name]));
  const invoiceMap = new Map(invoices.map(i => [i.id, `Facture n° ${i.invoiceNumber}`]));
  const vendorMap = new Map([
    ...maintenanceVendors.map(v => [v.id, v.name] as const),
    ...serviceProviders.map(v => [v.id, v.name] as const)
  ]);
  const ticketMap = new Map(tickets.map(t => [t.id, [t.title, t.category].filter(Boolean).join(' – ') || t.id]));

  for (const log of logs) {
    const et = log.entityType;
    let label: string | undefined;
    if (et === 'PROPERTY' || et === 'Property') label = propMap.get(log.entityId);
    else if (et === 'RENTAL_LEASE') label = leaseMap.get(log.entityId);
    else if (et === 'CONTACT' || et === 'Contact') label = contactMap.get(log.entityId);
    else if (et === 'DEAL' || et === 'CrmDeal') label = dealMap.get(log.entityId);
    else if (et === 'Tenant') label = tenantMap.get(log.entityId);
    else if (et === 'Invoice') label = invoiceMap.get(log.entityId);
    else if (et === 'MaintenanceVendor' || et === 'MAINTENANCE_VENDOR') label = vendorMap.get(log.entityId);
    else if (et === 'MaintenanceTicket' || et === 'MAINTENANCE_TICKET') label = ticketMap.get(log.entityId);
    if (label) labelByLogId.set(log.id, label);
  }

  return labelByLogId;
}

// Graceful shutdown: flush remaining entries BEFORE the database is closed.
// `utils/database` runs the registered hooks ahead of `$disconnect()` and owns
// `process.exit`; this module used to race it with its own SIGTERM handler.
registerShutdownHook('audit-queue', async () => {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
  await flushAuditQueue();
});

// Export AuditActionKey for convenience
export { AuditActionKey };
