import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { getCalendarEvents, CalendarFilters } from '../services/crm-calendar-service';
import { rescheduleAppointment, updateAppointment } from '../services/crm-appointment-service';
import { rescheduleFollowUp, markFollowUpDone } from '../services/crm-activity-service';
import { z } from 'zod';

// Validation schemas
const calendarQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  scope: z.enum(['GLOBAL', 'MINE']).optional(),
  types: z.string().optional() // Comma-separated: "appointments,followups"
});

const rescheduleAppointmentSchema = z.object({
  startAt: z.coerce.date(),
  endAt: z.coerce.date()
});

const updateAppointmentSchema = z.object({
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  location: z.string().optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'DONE', 'NO_SHOW', 'CANCELED']).optional()
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
      ? (validatedQuery.types.split(',') as ('appointments' | 'followups' | 'propertyVisits')[])
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
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch calendar events'
    });
  }
}

/**
 * Reschedule an appointment
 * PATCH /tenants/:tenantId/crm/appointments/:id/reschedule
 */
export async function rescheduleAppointmentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id: appointmentId } = req.params;
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
    const validatedData = rescheduleAppointmentSchema.parse(req.body);

    const appointment = await rescheduleAppointment(
      tenantId,
      appointmentId,
      validatedData.startAt,
      validatedData.endAt,
      actorUserId
    );

    res.status(200).json({
      success: true,
      data: appointment
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
      if (error.message.includes('must be after')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to reschedule appointment'
    });
  }
}

/**
 * Update an appointment (for resizing or other updates)
 * PATCH /tenants/:tenantId/crm/appointments/:id
 */
export async function updateAppointmentCalendarHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { id: appointmentId } = req.params;
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
    const validatedData = updateAppointmentSchema.parse(req.body);

    const appointment = await updateAppointment(tenantId, appointmentId, validatedData, actorUserId);

    res.status(200).json({
      success: true,
      data: appointment
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
      if (error.message.includes('must be')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to update appointment'
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
