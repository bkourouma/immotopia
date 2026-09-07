/**
 * Zod schemas for communication module – template, rule, communication, preference.
 * @see specs/010-communication-module/tasks.md T007
 */
import { z } from 'zod';

const communicationTypeEnum = z.enum(['ANNOUNCEMENT', 'ALERT', 'NOTIFICATION'], {
  errorMap: () => ({ message: 'Type invalide. Valeurs: ANNOUNCEMENT, ALERT, NOTIFICATION' })
});
const communicationChannelEnum = z.enum(['EMAIL', 'WHATSAPP', 'SMS'], {
  errorMap: () => ({ message: 'Canal invalide. Valeurs: EMAIL, WHATSAPP, SMS' })
});
const recipientTypeEnum = z.enum(['OWNER', 'RENTER', 'AGENCY_USER', 'CONTACT'], {
  errorMap: () => ({ message: 'Type destinataire invalide. Valeurs: OWNER, RENTER, AGENCY_USER, CONTACT' })
});
const eventTriggerEnum = z.enum(
  [
    'LEASE_ACTIVATED',
    'LEASE_ENDING_SOON',
    'INSTALLMENT_DUE_REMINDER',
    'INSTALLMENT_OVERDUE',
    'PAYMENT_RECEIVED',
    'PAYMENT_CONFIRMED',
    'TICKET_CREATED',
    'TICKET_STATUS_CHANGED',
    'DEAL_CREATED',
    'DEAL_STAGE_CHANGED',
    'APPOINTMENT_REMINDER',
    'PROPERTY_PUBLISHED',
    'DOCUMENT_EXPIRING',
    'INVITATION',
    'PASSWORD_RESET',
    'CUSTOM'
  ],
  { errorMap: () => ({ message: 'Événement déclencheur invalide' }) }
);

/** Create template */
export const createTemplateSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(200),
  type: communicationTypeEnum,
  channel: communicationChannelEnum,
  subject: z.string().max(500).optional(),
  body: z.string().min(1, 'Le corps du message est requis'),
  variables: z.array(z.string()).optional(),
  isActive: z.boolean().optional().default(true)
});

/** Update template (partial) */
export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: communicationTypeEnum.optional(),
  channel: communicationChannelEnum.optional(),
  subject: z.string().max(500).optional().nullable(),
  body: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
  isActive: z.boolean().optional()
});

/** Create notification rule */
export const createRuleSchema = z.object({
  name: z.string().min(1, 'Le nom est requis').max(200),
  eventTrigger: eventTriggerEnum,
  recipientTypes: z.array(recipientTypeEnum).min(1, 'Au moins un type de destinataire'),
  templateIdEmail: z.string().uuid().optional().nullable(),
  templateIdWhatsapp: z.string().uuid().optional().nullable(),
  templateIdSms: z.string().uuid().optional().nullable(),
  copyAgency: z.boolean().optional().default(false),
  active: z.boolean().optional().default(true)
});

/** Update rule (partial) */
export const updateRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  eventTrigger: eventTriggerEnum.optional(),
  recipientTypes: z.array(recipientTypeEnum).optional(),
  templateIdEmail: z.string().uuid().optional().nullable(),
  templateIdWhatsapp: z.string().uuid().optional().nullable(),
  templateIdSms: z.string().uuid().optional().nullable(),
  copyAgency: z.boolean().optional(),
  active: z.boolean().optional()
});

/** Create communication (send / schedule) */
export const createCommunicationSchema = z.object({
  type: communicationTypeEnum,
  channel: communicationChannelEnum,
  recipientType: recipientTypeEnum,
  recipientId: z.string().min(1, 'Destinataire requis'),
  subject: z.string().max(500).optional(),
  body: z.string().min(1, 'Le corps du message est requis'),
  scheduledAt: z.string().datetime().optional()
});

/** Bulk send */
export const bulkSendSchema = z.object({
  type: communicationTypeEnum.default('ANNOUNCEMENT'),
  channels: z.array(communicationChannelEnum).min(1),
  recipientIds: z
    .array(
      z.object({
        recipientType: recipientTypeEnum,
        recipientId: z.string().min(1)
      })
    )
    .min(1),
  subject: z.string().max(500).optional(),
  body: z.string().min(1),
  scheduledAt: z.string().datetime().optional()
});

/** Create/update preference */
export const createPreferenceSchema = z.object({
  recipientType: recipientTypeEnum,
  recipientId: z.string().min(1),
  channels: z.array(communicationChannelEnum).optional(),
  types: z.array(communicationTypeEnum).optional(),
  disabledTriggers: z.array(eventTriggerEnum).optional(),
  quietHoursStart: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .optional()
    .nullable(),
  quietHoursEnd: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .optional()
    .nullable()
});

export const updatePreferenceSchema = createPreferenceSchema.partial();

/** History list query */
export const listHistoryQuerySchema = z.object({
  type: communicationTypeEnum.optional(),
  channel: communicationChannelEnum.optional(),
  status: z.enum(['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED']).optional(),
  recipientId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;
export type CreateCommunicationInput = z.infer<typeof createCommunicationSchema>;
export type BulkSendInput = z.infer<typeof bulkSendSchema>;
export type CreatePreferenceInput = z.infer<typeof createPreferenceSchema>;
export type UpdatePreferenceInput = z.infer<typeof updatePreferenceSchema>;
export type ListHistoryQuery = z.infer<typeof listHistoryQuerySchema>;
