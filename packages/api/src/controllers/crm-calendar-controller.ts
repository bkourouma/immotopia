import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { getCalendarEvents, CalendarFilters } from '../services/crm-calendar-service';
import { rescheduleFollowUp, markFollowUpDone } from '../services/crm-activity-service';
import { z } from 'zod';

// Validation schemas
const calendarQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  scope: z.enum(['GLOBAL', 'MINE']).optional(),
  types: z.string().optional() // Comma-separated: "followups,propertyVisits"
});

const rescheduleFollowUpSchema = z.object({
  nextActionAt: z.coerce.date()
});

/**
 * Get calendar events
 * GET /tenants/:tenantId/crm/calendar
 */
export async function getCalendarHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const userId = req.user?.userId;

    // Validate query parameters
    const validatedQuery = calendarQuerySchema.parse(req.query);

    // Parse types filter
    const types = validatedQuery.types
      ? (validatedQuery.types.split(',') as ('followups' | 'propertyVisits')[])
      : undefined;

    const filters: CalendarFilters = {
      from: validatedQuery.from,
      to: validatedQuery.to,
      scope: validatedQuery.scope || 'GLOBAL',
      types,
      userId: validatedQuery.scope === 'MINE' ? userId : undefined
    };

    const events = await getCalendarEvents(tenantId, filters);

    res.status(200).json({
      success: true,
      events
    });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: error.errors
      });
      return;
    }

    // Log detailed error for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Calendar events error details:', { errorMessage, errorStack });

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: errorMessage || 'Failed to fetch calendar events'
    });
  }
}

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
