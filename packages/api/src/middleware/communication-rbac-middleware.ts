/**
 * RBAC for communication module – tenant-scoped access.
 * Allows users with TENANT_ADMIN or COMMUNICATION_VIEW (assigned to Admin, Manager, Agent).
 * @see specs/010-communication-module/tasks.md T015
 */
import { requireAnyPermission } from './rbac-middleware';

export const requireCommunicationPermission = requireAnyPermission(['TENANT_ADMIN', 'COMMUNICATION_VIEW']);
