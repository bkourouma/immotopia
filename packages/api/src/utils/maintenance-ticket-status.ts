import { MaintenanceTicketStatus } from '@prisma/client';

export const OPEN_TICKET_STATUSES: MaintenanceTicketStatus[] = [
  MaintenanceTicketStatus.DECLARED,
  MaintenanceTicketStatus.IN_PROGRESS,
  MaintenanceTicketStatus.ASSIGNED
];
