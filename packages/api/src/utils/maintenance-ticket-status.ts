import { MaintenanceTicketStatus } from '@prisma/client';

export const OPEN_TICKET_STATUSES: MaintenanceTicketStatus[] = [
  MaintenanceTicketStatus.DECLARED,
  MaintenanceTicketStatus.IN_PROGRESS,
  MaintenanceTicketStatus.ASSIGNED
];

export function startOfMaintenanceDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function isOpenMaintenanceOverdue(status: MaintenanceTicketStatus, dueDate: Date | null, today: Date): boolean {
  return dueDate !== null && OPEN_TICKET_STATUSES.includes(status) && dueDate < today;
}
