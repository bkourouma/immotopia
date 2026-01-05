import { prisma } from '../utils/database';
import { AuditLogEntry, AuditActionKey } from '../types/audit-types';
import { logger } from '../utils/logger';

// In-memory audit queue
const auditQueue: AuditLogEntry[] = [];
let flushInterval: NodeJS.Timeout | null = null;

// Queue flush threshold
const QUEUE_FLUSH_THRESHOLD = 100;
const QUEUE_FLUSH_INTERVAL_MS = 5000; // 5 seconds

/**
 * Add audit log entry (non-blocking)
 * @param entry - Audit log entry
 */
export function logAuditEvent(entry: AuditLogEntry): void {
  auditQueue.push({
    ...entry,
    createdAt: entry.createdAt || new Date()
  });

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
      data: entries.map(entry => ({
        actorUserId: entry.actorUserId || null,
        tenantId: entry.tenantId || null,
        actionKey: entry.actionKey,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
        payload: entry.payload || null,
        createdAt: entry.createdAt || new Date()
      })),
      skipDuplicates: true
    });

    logger.debug('Audit log queue flushed', { count: entries.length });
  } catch (error) {
    // Re-queue failed entries (with retry limit)
    logger.error('Audit log flush failed, re-queuing entries', {
      error,
      entryCount: entries.length
    });
    auditQueue.unshift(...entries);
  }

  // Clear interval if queue is empty
  if (auditQueue.length === 0 && flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
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

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        actor: {
          select: {
            id: true,
            email: true,
            fullName: true
          }
        },
        tenant: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }),
    prisma.auditLog.count({ where })
  ]);

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

// Graceful shutdown: flush remaining entries
process.on('SIGTERM', async () => {
  if (flushInterval) {
    clearInterval(flushInterval);
  }
  await flushAuditQueue();
  process.exit(0);
});

process.on('SIGINT', async () => {
  if (flushInterval) {
    clearInterval(flushInterval);
  }
  await flushAuditQueue();
  process.exit(0);
});

// Export AuditActionKey for convenience
export { AuditActionKey };




