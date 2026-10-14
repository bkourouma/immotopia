import { prisma } from '../utils/database';
import { AuditLogEntry, AuditActionKey } from '../types/audit-types';
import { logger } from '../utils/logger';
import { registerShutdownHook } from '../utils/shutdown-hooks';
import { AuditRow, buildAuditRow } from './audit-entry-builder';
import { formatSlipNumber } from '../lib/finance/stock-bons';

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

const NATIVE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identifiants acceptables par une colonne `@db.Uuid` (bail, ticket, prestataire).
 * Un `entityId` d'une autre forme (ligne ancienne, clé libre) ferait échouer la
 * requête entière ; il n'a de toute façon aucun libellé à fournir.
 */
function nativeUuids(ids: Set<string>): string[] {
  return [...ids].filter(id => NATIVE_UUID.test(id));
}

/**
 * Enrich audit logs with human-readable resource labels by fetching actual entity data.
 * Same kind of display as in the app (e.g. property ref + title + address, lease number, contact name).
 */
export async function enrichAuditLogsWithResourceLabels(
  logs: Parameters<typeof loadResourceLabels>[0],
  scopeTenantId?: string
): Promise<Map<string, string>> {
  // Les libellés sont cosmétiques : le journal doit s'afficher même quand ils
  // ne peuvent pas être résolus.
  try {
    return await loadResourceLabels(logs, scopeTenantId);
  } catch (error) {
    logger.warn('Audit: libellés de ressource indisponibles', {
      error: error instanceof Error ? error.message : String(error)
    });
    return new Map();
  }
}

async function loadResourceLabels(
  logs: Array<{
    id: string;
    entityType: string;
    entityId: string;
    tenantId: string | null;
    payload?: unknown;
  }>,
  /**
   * Vue d'une agence : chaque requete est bornee a cette agence. Sans cela, une
   * ligne dont l'`entityId` designerait l'objet d'une autre agence en afficherait
   * le libelle, et la garde Prisma (requete sans filtre d'agence en contexte
   * d'agence) la signalerait. Absent : vue plateforme, toutes agences.
   */
  scopeTenantId?: string
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
            where: { id: { in: [...propIds] }, ...(scopeTenantId ? { tenantId: scopeTenantId } : {}) },
            select: { id: true, internalReference: true, title: true, address: true }
          })
        : [],
      nativeUuids(leaseIds).length > 0
        ? prisma.rentalLease.findMany({
            where: { id: { in: nativeUuids(leaseIds) }, ...(scopeTenantId ? { tenant_id: scopeTenantId } : {}) },
            select: {
              id: true,
              lease_number: true,
              property: { select: { internalReference: true, title: true, address: true } }
            }
          })
        : [],
      contactIds.size > 0
        ? prisma.crmContact.findMany({
            where: { id: { in: [...contactIds] }, ...(scopeTenantId ? { tenantId: scopeTenantId } : {}) },
            select: { id: true, firstName: true, lastName: true, email: true, legalName: true }
          })
        : [],
      dealIds.size > 0
        ? prisma.crmDeal.findMany({
            where: { id: { in: [...dealIds] }, ...(scopeTenantId ? { tenantId: scopeTenantId } : {}) },
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
            where: { id: { in: scopeTenantId ? [...tenantIds].filter(id => id === scopeTenantId) : [...tenantIds] } },
            select: { id: true, name: true }
          })
        : [],
      invoiceIds.size > 0
        ? prisma.invoice.findMany({
            where: { id: { in: [...invoiceIds] }, ...(scopeTenantId ? { tenantId: scopeTenantId } : {}) },
            select: { id: true, invoiceNumber: true }
          })
        : [],
      nativeUuids(vendorIds).length > 0
        ? prisma.maintenanceVendor.findMany({
            where: { id: { in: nativeUuids(vendorIds) }, ...(scopeTenantId ? { tenant_id: scopeTenantId } : {}) },
            select: { id: true, name: true }
          })
        : [],
      nativeUuids(vendorIds).length > 0
        ? prisma.serviceProvider.findMany({
            where: { id: { in: nativeUuids(vendorIds) }, ...(scopeTenantId ? { tenantId: scopeTenantId } : {}) },
            select: { id: true, name: true }
          })
        : [],
      nativeUuids(ticketIds).length > 0
        ? prisma.maintenanceTicket.findMany({
            where: { id: { in: nativeUuids(ticketIds) }, ...(scopeTenantId ? { tenant_id: scopeTenantId } : {}) },
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

  await loadStockResourceLabels(logs, scopeTenantId, labelByLogId);

  return labelByLogId;
}

/** `jj/mm/aaaa` au jour UTC, comme les dates de pièce du stock. */
function formatUtcDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/**
 * Libellés des objets du stock (spec 040, B6-R3) : un bon par son numéro, un
 * inventaire par son lieu et sa date, un preneur par son nom. Bornés à
 * l'agence en vue d'agence, comme les autres libellés.
 */
async function loadStockResourceLabels(
  logs: Array<{ id: string; entityType: string; entityId: string }>,
  scopeTenantId: string | undefined,
  labelByLogId: Map<string, string>
): Promise<void> {
  const slipIds = new Set<string>();
  const countIds = new Set<string>();
  const takerIds = new Set<string>();
  for (const log of logs) {
    if (log.entityType === 'StockSlip') slipIds.add(log.entityId);
    else if (log.entityType === 'StockCount') countIds.add(log.entityId);
    else if (log.entityType === 'StockTaker') takerIds.add(log.entityId);
  }
  const scope = scopeTenantId ? { tenantId: scopeTenantId } : {};

  const [slips, counts, takers] = await Promise.all([
    nativeUuids(slipIds).length > 0
      ? prisma.stockSlip.findMany({
          where: { id: { in: nativeUuids(slipIds) }, ...scope },
          select: { id: true, kind: true, year: true, number: true }
        })
      : [],
    nativeUuids(countIds).length > 0
      ? prisma.stockCount.findMany({
          where: { id: { in: nativeUuids(countIds) }, ...scope },
          select: { id: true, countedAt: true, location: { select: { label: true } } }
        })
      : [],
    nativeUuids(takerIds).length > 0
      ? prisma.stockTaker.findMany({
          where: { id: { in: nativeUuids(takerIds) }, ...scope },
          select: { id: true, fullName: true }
        })
      : []
  ]);

  const stockLabels = new Map<string, string>([
    ...slips.map(slip => [slip.id, formatSlipNumber(slip.kind, slip.year, slip.number)] as const),
    ...counts.map(
      count =>
        [
          count.id,
          `Inventaire — ${count.location?.label ?? 'Lieu inconnu'} du ${formatUtcDate(count.countedAt)}`
        ] as const
    ),
    ...takers.map(taker => [taker.id, taker.fullName] as const)
  ]);

  for (const log of logs) {
    if (log.entityType !== 'StockSlip' && log.entityType !== 'StockCount' && log.entityType !== 'StockTaker') continue;
    const label = stockLabels.get(log.entityId);
    if (label) labelByLogId.set(log.id, label);
  }
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
