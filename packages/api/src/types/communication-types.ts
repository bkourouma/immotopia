/**
 * Communication module – types and DTOs placeholder.
 * Enums and full DTOs will be aligned with Prisma schema in Phase 2.
 * @see specs/010-communication-module/plan.md
 */

/** Communication type: ANNOUNCEMENT | ALERT | NOTIFICATION */
export type CommunicationType = 'ANNOUNCEMENT' | 'ALERT' | 'NOTIFICATION';

/** Channel: EMAIL | WHATSAPP | SMS (SMS reserved for future) */
export type CommunicationChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';

/** Delivery status */
export type CommunicationStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'CANCELLED';

/** Recipient type for targeting */
export type RecipientType = 'OWNER' | 'RENTER' | 'AGENCY_USER' | 'CONTACT';

/** Event triggers (aligned with spec – rental, maintenance, CRM, property) */
export type EventTrigger =
  | 'LEASE_ACTIVATED'
  | 'LEASE_ENDING_SOON'
  | 'INSTALLMENT_DUE_REMINDER'
  | 'INSTALLMENT_OVERDUE'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_CONFIRMED'
  | 'TICKET_CREATED'
  | 'TICKET_STATUS_CHANGED'
  | 'DEAL_CREATED'
  | 'DEAL_STAGE_CHANGED'
  | 'APPOINTMENT_REMINDER'
  | 'PROPERTY_PUBLISHED'
  | 'DOCUMENT_EXPIRING'
  | 'INVITATION'
  | 'PASSWORD_RESET'
  | 'CUSTOM';

/** Placeholder DTO for template create/update (Phase 2: Zod + Prisma) */
export interface CreateTemplateDto {
  name: string;
  type: CommunicationType;
  channel: CommunicationChannel;
  subject?: string;
  body: string;
  variables?: string[];
}

/** Placeholder DTO for notification rule create/update */
export interface CreateRuleDto {
  name: string;
  eventTrigger: EventTrigger;
  recipientTypes: RecipientType[];
  templateIds?: Record<CommunicationChannel, string | null>;
  copyAgency?: boolean;
  active?: boolean;
}

/** Placeholder DTO for communication (send/schedule) */
export interface CreateCommunicationDto {
  type: CommunicationType;
  channel: CommunicationChannel;
  recipientType: RecipientType;
  recipientId: string;
  subject?: string;
  body: string;
  scheduledAt?: string; // ISO date
}

/** Placeholder DTO for recipient preferences */
export interface CreatePreferenceDto {
  recipientType: RecipientType;
  recipientId: string;
  channels?: CommunicationChannel[];
  types?: CommunicationType[];
  disabledTriggers?: EventTrigger[];
  quietHoursStart?: string; // HH:mm
  quietHoursEnd?: string; // HH:mm
}
