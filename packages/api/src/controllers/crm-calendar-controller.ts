import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { getCalendarEvents, CalendarFilters } from '../services/crm-calendar-service';
import { rescheduleFollowUp, markFollowUpDone } from '../services/crm-activity-service';
import { z } from 'zod';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { t } from '../i18n';

// Validation schemas
const calendarQuerySchema = z.object({
  scope: z.enum(['GLOBAL', 'MINE']).optional(),
  types: z.string().optional() // Comma-separated: "followups,propertyVisits"
});

const rescheduleFollowUpSchema = z.object({
  nextActionAt: z.coerce.date()
});

/** Plafond de l'intervalle demandé : le calendrier affiche au plus quelques mois. */
export const CALENDAR_MAX_RANGE_DAYS = 366;

const CALENDAR_TYPES = ['followups', 'propertyVisits'] as const;

function parseCalendarDate(value: unknown, label: 'from' | 'to'): Date {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestError(t('Le paramètre « {{label}} » est obligatoire (date ISO, ex. 2026-09-01).', { label }));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestError(
      t("Le paramètre « {{label}} » n'est pas une date valide (attendu : date ISO).", { label })
    );
  }
  return date;
}

/**
 * Get calendar events
 * GET /tenants/:tenantId/crm/calendar
 *
 * `from` et `to` sont obligatoires et bornés : toute erreur de paramètre
 * répond immédiatement en 400 via `errorHandler` (pas de requête pendante).
 */
export const getCalendarHandler = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = getTenantIdFromRequest(req);
  const userId = req.user?.userId;

  const from = parseCalendarDate(req.query.from, 'from');
  const to = parseCalendarDate(req.query.to, 'to');
  if (to.getTime() < from.getTime()) {
    throw new BadRequestError('La date de fin « to » doit être postérieure à la date de début « from ».');
  }
  if (to.getTime() - from.getTime() > CALENDAR_MAX_RANGE_DAYS * 24 * 3600 * 1000) {
    throw new BadRequestError('La période demandée est trop longue (maximum 366 jours).');
  }

  const parsed = calendarQuerySchema.safeParse({ scope: req.query.scope, types: req.query.types });
  if (!parsed.success) {
    throw new BadRequestError('Le paramètre « scope » est invalide (valeurs : GLOBAL, MINE).');
  }
  const scope = parsed.data.scope || 'GLOBAL';

  let types: ('followups' | 'propertyVisits')[] | undefined;
  if (parsed.data.types) {
    const requested = parsed.data.types.split(',').map(v => v.trim());
    if (requested.some(v => !(CALENDAR_TYPES as readonly string[]).includes(v))) {
      throw new BadRequestError('Le paramètre « types » est invalide (valeurs : followups, propertyVisits).');
    }
    types = requested as ('followups' | 'propertyVisits')[];
  }

  const filters: CalendarFilters = {
    from,
    to,
    scope,
    types,
    userId: scope === 'MINE' ? userId : undefined
  };

  const events = await getCalendarEvents(tenantId, filters);

  res.status(200).json({ success: true, events });
});

/**
 * Reschedule a follow-up
 * PATCH /tenants/:tenantId/crm/activities/:id/next-action
 */
export async function rescheduleFollowUpHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id: activityId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User ID is required'
      });
      return;
    }

    // Validate request body
    const validatedData = rescheduleFollowUpSchema.parse(req.body);

    const activity = await rescheduleFollowUp(tenantId, activityId, validatedData.nextActionAt, actorUserId);

    res.status(200).json({
      success: true,
      data: activity
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid request data',
        details: error.errors
      });
      return;
    }
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to reschedule follow-up'
    });
  }
}

/**
 * Mark follow-up as done
 * PATCH /tenants/:tenantId/crm/activities/:id/mark-done
 */
export async function markFollowUpDoneHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id: activityId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User ID is required'
      });
      return;
    }

    const activity = await markFollowUpDone(tenantId, activityId, actorUserId);

    res.status(200).json({
      success: true,
      data: activity
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to mark follow-up as done'
    });
  }
}
