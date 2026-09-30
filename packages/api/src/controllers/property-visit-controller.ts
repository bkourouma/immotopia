import { Request, Response } from 'express';
import { z } from 'zod';
import {
  scheduleVisit,
  updateVisitStatus,
  getPropertyVisits,
  getCalendarVisits,
  completeVisit,
  MAX_VISIT_DURATION_MINUTES
} from '../services/property-visit-service';
import { PropertyVisitType, PropertyVisitStatus, PropertyVisitGoal } from '@prisma/client';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { t } from '../i18n';

/** Meme borne que le calendrier CRM (`CALENDAR_MAX_RANGE_DAYS`). */
const CALENDAR_VISITS_MAX_RANGE_DAYS = 366;

/**
 * Le corps des requêtes est validé ici, avant toute écriture : une valeur
 * inconnue (statut, type, objectif) ou une date illisible est refusée par un
 * ZodError, que le middleware d'erreurs transforme en 400 VALIDATION_ERROR avec
 * `errors[]` — jamais l'erreur brute de Prisma.
 * Les schémas sont construits à la demande : `t()` dépend de la langue de la requête.
 */
const optionalId = () => z.string().trim().min(1).max(64).nullish();
const optionalText = (max: number) => z.string().max(max).nullish();

function dateField(message: string) {
  return z
    .string({ required_error: message, invalid_type_error: message })
    .min(1, message)
    .refine(value => !Number.isNaN(Date.parse(value)), message)
    .transform(value => new Date(value));
}

function scheduleVisitSchema() {
  return z.object({
    contactId: optionalId(),
    dealId: optionalId(),
    visitType: z
      .nativeEnum(PropertyVisitType, { errorMap: () => ({ message: t('Type de visite invalide') }) })
      .default(PropertyVisitType.VISIT),
    goal: z
      .nativeEnum(PropertyVisitGoal, { errorMap: () => ({ message: t('Objectif de visite invalide') }) })
      .nullish(),
    scheduledAt: dateField(t('Date et heure de visite invalides')),
    duration: z
      .number({ invalid_type_error: t('Durée de visite invalide') })
      .int(t('Durée de visite invalide'))
      .min(1, t('Durée de visite invalide'))
      .max(MAX_VISIT_DURATION_MINUTES, t('Durée de visite invalide'))
      .nullish(),
    location: optionalText(500),
    assignedToUserId: optionalId(),
    collaboratorIds: z.array(z.string().trim().min(1).max(64)).max(50).nullish(),
    notes: optionalText(5000)
  });
}

function updateStatusSchema() {
  return z.object({
    status: z.nativeEnum(PropertyVisitStatus, {
      errorMap: () => ({ message: t('Statut de visite invalide') })
    }),
    notes: optionalText(5000)
  });
}

function completeVisitSchema() {
  return z.object({ notes: optionalText(5000) });
}

function calendarQuerySchema() {
  const invalid = t('Période du calendrier invalide');
  return z
    .object({
      startDate: dateField(invalid).optional(),
      endDate: dateField(invalid).optional(),
      assignedToUserId: z.string().trim().max(64).optional()
    })
    .refine(q => !q.startDate || !q.endDate || q.startDate <= q.endDate, {
      message: invalid,
      path: ['endDate']
    });
}

/**
 * Schedule visit handler
 */
export const scheduleVisitHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const userId = req.user?.userId;
  const body = scheduleVisitSchema().parse(req.body ?? {});

  const visit = await scheduleVisit(
    propertyId,
    {
      contactId: body.contactId || null,
      dealId: body.dealId || null,
      visitType: body.visitType,
      goal: body.goal ?? null,
      scheduledAt: body.scheduledAt,
      duration: body.duration ?? null,
      location: body.location || null,
      assignedToUserId: body.assignedToUserId || null,
      collaboratorIds: body.collaboratorIds || [],
      notes: body.notes || null
    },
    tenantId,
    userId
  );

  res.json({ success: true, data: visit });
});

/**
 * Update visit status handler
 */
export const updateVisitStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const visitId = req.params.visitId;
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const userId = req.user?.userId;
  const { status, notes } = updateStatusSchema().parse(req.body ?? {});

  const visit = await updateVisitStatus(visitId, status, tenantId, userId, notes || null);

  res.json({ success: true, data: visit });
});

/**
 * Get property visits handler
 */
export const getPropertyVisitsHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;

  const visits = await getPropertyVisits(propertyId, tenantId);

  res.json({ success: true, data: visits });
});

/**
 * Get calendar visits handler
 */
export const getCalendarVisitsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const query = calendarQuerySchema().parse({
    startDate: req.query.startDate || undefined,
    endDate: req.query.endDate || undefined,
    assignedToUserId: req.query.assignedToUserId || undefined
  });
  const startDate = query.startDate ?? new Date();
  const endDate = query.endDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default: 30 days from now

  if (endDate.getTime() - startDate.getTime() > CALENDAR_VISITS_MAX_RANGE_DAYS * 24 * 3600 * 1000) {
    throw new BadRequestError(t('La période demandée est trop longue (maximum 366 jours).'));
  }

  const visits = await getCalendarVisits(startDate, endDate, tenantId, query.assignedToUserId || null);

  res.json({ success: true, data: visits });
});

/**
 * Complete visit handler
 */
export const completeVisitHandler = asyncHandler(async (req: Request, res: Response) => {
  const visitId = req.params.visitId;
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const userId = req.user?.userId;
  const { notes } = completeVisitSchema().parse(req.body ?? {});

  const visit = await completeVisit(visitId, tenantId, userId, notes || null);

  res.json({ success: true, data: visit });
});
