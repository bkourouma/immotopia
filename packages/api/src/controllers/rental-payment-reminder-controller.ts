import { Request, Response } from 'express';
import { z } from 'zod';
import { t } from '../i18n';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { buildReminderPreview } from '../lib/rental/payment-reminders/plan';
import { sendInstallmentReminder, sendReminderBatch } from '../lib/rental/payment-reminders/send';
import { listInstallmentReminders, listReminders } from '../lib/rental/payment-reminders/history';
import type {
  ListRemindersQuery,
  RentalReminderChannel,
  RentalReminderLevel,
  RentalReminderPreviewQuery
} from '../lib/rental/payment-reminders/types';

/**
 * Relances de loyer (spec 049, contrat section 3), côté agence :
 * `/tenants/:tenantId/rental/payment-reminders*` et `/installments/:installmentId/reminder(s)`.
 * `tenantId` vient UNIQUEMENT du contexte posé par `requireTenantAccess`.
 * Un envoi `FAILED` ou un lot reste un 200 ; les erreurs des services passent telles quelles.
 */

const idSchema = z.string().uuid();
const channelSchema = z.enum(['EMAIL', 'WHATSAPP']);
const channelsSchema = z
  .array(channelSchema)
  .min(1)
  .max(2)
  .refine(list => new Set(list).size === list.length, { message: 'Canaux en double.' });
const levelSchema = z.number().int().min(1).max(3);

const intParam = (min: number, max?: number) => {
  const base = z.coerce.number().int().min(min);
  return max === undefined ? base : base.max(max);
};

const previewQuerySchema = z
  .object({
    daysBefore: intParam(0, 30).default(0),
    minDaysLate: intParam(0).default(1),
    leaseId: idSchema.optional(),
    propertyId: z.string().min(1).max(64).optional(),
    installmentId: idSchema.optional(),
    search: z.string().trim().max(100).optional(),
    eligibleOnly: z
      .enum(['true', 'false'])
      .transform(v => v === 'true')
      .default('false')
  })
  .strict();

const sendBodySchema = z
  .object({
    channels: channelsSchema.optional(),
    level: levelSchema.optional()
  })
  .strict();

const batchBodySchema = z
  .object({
    installmentIds: z
      .array(idSchema)
      .min(1)
      .max(100)
      .refine(list => new Set(list).size === list.length, { message: 'Identifiants en double.' }),
    channels: channelsSchema.optional()
  })
  .strict();

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    v => {
      const d = new Date(`${v}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    },
    { message: 'Date invalide.' }
  );

const historyQuerySchema = z
  .object({
    installmentId: idSchema.optional(),
    leaseId: idSchema.optional(),
    channel: channelSchema.optional(),
    status: z.enum(['SENT', 'DELIVERED', 'FAILED']).optional(),
    level: intParam(1, 3).optional(),
    from: isoDay.optional(),
    to: isoDay.optional(),
    page: intParam(1).default(1),
    pageSize: intParam(1, 100).default(20)
  })
  .strict()
  .refine(q => !q.from || !q.to || q.from <= q.to, { message: 'from doit précéder to.', path: ['from'] });

function resolveTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError(t('TenantId manquant'));
  return tenantId;
}

export const previewRemindersHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const query = previewQuerySchema.parse(req.query) as RentalReminderPreviewQuery;
  const data = await buildReminderPreview(tenantId, query);
  res.json({ success: true, data });
});

export const sendInstallmentReminderHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const installmentId = idSchema.parse(req.params.installmentId);
  const body = sendBodySchema.parse(req.body ?? {}) as {
    channels?: RentalReminderChannel[];
    level?: RentalReminderLevel;
  };
  const data = await sendInstallmentReminder(tenantId, req.user?.userId ?? null, installmentId, body);
  res.json({ success: true, data });
});

export const sendReminderBatchHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const body = batchBodySchema.parse(req.body ?? {}) as {
    installmentIds: string[];
    channels?: RentalReminderChannel[];
  };
  const data = await sendReminderBatch(tenantId, req.user?.userId ?? null, body);
  res.json({ success: true, data });
});

export const listRemindersHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const query = historyQuerySchema.parse(req.query) as ListRemindersQuery;
  const data = await listReminders(tenantId, query);
  res.json({ success: true, data });
});

export const listInstallmentRemindersHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const installmentId = idSchema.parse(req.params.installmentId);
  const data = await listInstallmentReminders(tenantId, installmentId);
  res.json({ success: true, data });
});
