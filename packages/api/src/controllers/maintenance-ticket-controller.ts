import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import {
  createTicket,
  getTenantTickets,
  getTicketById,
  cancelTicket,
  deleteTicket,
  updateTenantTicket,
  getAllTickets,
  updateTicket,
  getPropertyMaintenanceHistory,
  listActiveLeasesForProperty
} from '../services/maintenance-ticket-service';
import { addRequesterComment, addManagerComment } from '../services/maintenance-comment-service';
import { UnauthorizedError, asyncHandler } from '../middleware/error-middleware';
import {
  createTicketSchema,
  createCommentSchema,
  updateTicketSchema,
  updateTenantTicketSchema
} from '../types/maintenance-types';
import { MaintenanceTicketStatus, MaintenanceTicketPriority, MaintenanceTicketCategory } from '@prisma/client';

/**
 * Repond directement quand l'erreur porte deja son statut HTTP.
 *
 * Les `catch` de ce fichier classaient les erreurs au mot present dans leur
 * message (« introuvable », « invalide »). Un message reecrit changeait donc
 * son code HTTP : un refus metier devenait un 500 generique, et la raison du
 * refus n'atteignait plus l'ecran. Les erreurs de `lib/errors` disent
 * elles-memes leur statut ; c'est cette reponse-la qui prime.
 */
function repondreErreurPortee(res: Response, error: unknown): boolean {
  // `status` : erreurs de `lib/errors` ; `statusCode` : classes typées de
  // `middleware/error-middleware` (AppError).
  const porteur = error as { status?: unknown; statusCode?: unknown };
  const statut = Number(porteur?.status ?? porteur?.statusCode);
  if (!Number.isInteger(statut) || statut < 400 || statut >= 600) {
    return false;
  }

  res.status(statut).json({
    success: false,
    message: (error as Error).message
  });
  return true;
}

/**
 * Utilisateur authentifié des routes « mes demandes ».
 *
 * C'est lui, et lui seul, qui délimite ce qu'un collaborateur voit et
 * modifie sur ces routes : jamais un `tenantContactId` ou un identifiant
 * d'utilisateur reçu dans la requête.
 */
function requesterUserIdOf(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new UnauthorizedError();
  }
  return userId;
}

/**
 * Baux actifs d'un bien (choix du bail à la création d'un ticket).
 * GET /tenants/:tenantId/maintenance/tenant/properties/:propertyId/active-leases
 */
export const listActiveLeasesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const data = await listActiveLeasesForProperty(tenantId, req.params.propertyId);
  res.status(200).json({ success: true, data });
});

/**
 * Create a new maintenance ticket
 * POST /tenants/:tenantId/maintenance/tenant/tickets
 */
export async function createTicketHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const actorUserId = req.user?.userId;

    // Get tenant contact ID from request (could be from body, params, or user context)
    const actorContactId =
      req.body.tenantContactId ||
      req.params.tenantContactId ||
      (req.user?.tenantContext?.isClient ? req.user.userId : undefined);

    // Validate request body
    const validatedData = createTicketSchema.parse(req.body);

    const ticket = await createTicket(tenantId, validatedData, actorUserId, actorContactId);

    res.status(201).json({
      success: true,
      data: ticket
    });
  } catch (error) {
    if (repondreErreurPortee(res, error)) {
      return;
    }
    console.error('Error creating maintenance ticket:', error);
    if (error instanceof Error) {
      if (error.message.includes('Bail actif introuvable')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
      if (error.message.includes('invalide') || error.message.includes('requis')) {
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
      message: 'Échec de la création du ticket de maintenance'
    });
  }
}

/**
 * List tenant tickets with filters
 * GET /tenants/:tenantId/maintenance/tenant/tickets
 */
export async function listTenantTicketsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const requesterUserId = requesterUserIdOf(req);

    const filters: any = {};
    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.propertyId) {
      filters.propertyId = req.query.propertyId as string;
    }
    if (req.query.leaseId) {
      filters.leaseId = req.query.leaseId as string;
    }

    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await getTenantTickets(tenantId, requesterUserId, filters, { page, limit });

    // Transform tickets from snake_case to camelCase
    const transformedTickets = result.tickets.map(transformTicketFields);

    res.status(200).json({
      success: true,
      data: transformedTickets,
      pagination: result.pagination
    });
  } catch (error) {
    if (repondreErreurPortee(res, error)) {
      return;
    }
    console.error('Error listing tenant tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Échec de la récupération de la liste des tickets'
    });
  }
}

/**
 * Transform Prisma attachment to frontend format (snake_case to camelCase)
 */
function transformAttachment(attachment: any): any {
  return {
    id: attachment.id,
    ticketId: attachment.ticket_id,
    fileUrl: attachment.file_url,
    fileName: attachment.file_name,
    mimeType: attachment.mime_type,
    fileSize: attachment.file_size,
    uploadedByUserId: attachment.uploaded_by_user_id || undefined,
    uploadedByContactId: attachment.uploaded_by_contact_id || undefined,
    createdAt: attachment.created_at
  };
}

/**
 * Transform Prisma ticket basic fields from snake_case to camelCase
 */
function transformTicketFields(ticket: any): any {
  const transformed = {
    id: ticket.id,
    tenantId: ticket.tenant_id,
    propertyId: ticket.property_id,
    leaseId: ticket.lease_id || undefined,
    tenantContactId: ticket.tenant_contact_id || undefined,
    title: ticket.title,
    category: ticket.category,
    priority: ticket.priority,
    description: ticket.description,
    locationDetails: ticket.location_details || undefined,
    status: ticket.status,
    assignedVendorId: ticket.assigned_vendor_id || undefined,
    assignedToUserId: ticket.assigned_to_user_id || undefined,
    resolutionNotes: ticket.resolution_notes || undefined,
    declaredAt: ticket.declared_at,
    inProgressAt: ticket.in_progress_at || undefined,
    assignedAt: ticket.assigned_at || undefined,
    resolvedAt: ticket.resolved_at || undefined,
    canceledAt: ticket.canceled_at || undefined,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    // Include relations if they exist
    property: ticket.property
      ? {
          id: ticket.property.id,
          internalReference: ticket.property.internalReference,
          address: ticket.property.address,
          title: ticket.property.title
        }
      : undefined,
    lease: ticket.lease
      ? {
          id: ticket.lease.id,
          leaseNumber: ticket.lease.lease_number
        }
      : undefined,
    tenantContact: ticket.tenantContact
      ? {
          id: ticket.tenantContact.id,
          firstName: ticket.tenantContact.firstName,
          lastName: ticket.tenantContact.lastName,
          email: ticket.tenantContact.email
        }
      : undefined,
    assignedVendor:
      ticket.assignedVendor && ticket.assignedVendor.id
        ? {
            id: ticket.assignedVendor.id,
            name: ticket.assignedVendor.name || '',
            phone: ticket.assignedVendor.phone || undefined,
            email: ticket.assignedVendor.email || undefined
          }
        : undefined,
    assignedToUser: ticket.assignedToUser
      ? {
          id: ticket.assignedToUser.id,
          email: ticket.assignedToUser.email,
          fullName: ticket.assignedToUser.fullName || undefined
        }
      : undefined
  };

  return transformed;
}

/**
 * Transform Prisma ticket to frontend format
 */
function transformTicket(ticket: any): any {
  return {
    ...transformTicketFields(ticket),
    attachments: (ticket.attachments || []).map(transformAttachment),
    comments: (ticket.comments || []).map((comment: any) => ({
      id: comment.id,
      ticketId: comment.ticket_id,
      authorType: comment.author_type,
      content: comment.content,
      authorUserId: comment.author_user_id || undefined,
      authorContactId: comment.author_contact_id || undefined,
      createdAt: comment.created_at,
      authorUser: comment.authorUser,
      authorContact: comment.authorContact
    })),
    statusHistory: (ticket.statusHistory || []).map((history: any) => ({
      id: history.id,
      ticketId: history.ticket_id,
      fromStatus: history.from_status || undefined,
      toStatus: history.to_status,
      note: history.note || undefined,
      changedByUserId: history.changed_by_user_id || undefined,
      changedAt: history.changed_at,
      changedByUser: history.changedByUser
    }))
  };
}

/**
 * Get ticket by ID with full details
 * GET /tenants/:tenantId/maintenance/tenant/tickets/:ticketId
 */
export async function getTenantTicketHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { ticketId } = req.params;

    const ticket = await getTicketById(tenantId, ticketId, requesterUserIdOf(req));
    const transformedTicket = transformTicket(ticket);

    res.status(200).json({
      success: true,
      data: transformedTicket
    });
  } catch (error) {
    if (repondreErreurPortee(res, error)) {
      return;
    }
    console.error('Error getting ticket:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
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
      message: 'Échec de la récupération du ticket'
    });
  }
}

/**
 * Cancel or update a ticket
 * PATCH /tenants/:tenantId/maintenance/tenant/tickets/:ticketId
 * Routes to cancelTicketHandler if status: CANCELED, otherwise to updateTenantTicketHandler
 */
export async function cancelTicketHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { ticketId } = req.params;
    const requesterUserId = requesterUserIdOf(req);

    // If only status: CANCELED is provided, handle as cancellation
    if (req.body.status === 'CANCELED' && Object.keys(req.body).length === 1 + (req.body.tenantContactId ? 1 : 0)) {
      const ticket = await cancelTicket(tenantId, ticketId, requesterUserId);

      res.status(200).json({
        success: true,
        data: ticket
      });
      return;
    }

    // Otherwise, handle as update (will validate that status is DECLARED)
    // Remove status from body if present (tenants can't change status except to CANCELED)
    const updateData = { ...req.body };
    if (updateData.status && updateData.status !== 'CANCELED') {
      delete updateData.status;
    }

    // Validate request body
    const validatedData = updateTenantTicketSchema.parse(updateData);

    const ticket = await updateTenantTicket(tenantId, ticketId, validatedData, requesterUserId);

    res.status(200).json({
      success: true,
      data: ticket
    });
  } catch (error) {
    if (repondreErreurPortee(res, error)) {
      return;
    }
    console.error('Error updating/canceling ticket:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (
        error.message.includes('déjà annulé') ||
        error.message.includes('résolu') ||
        error.message.includes('Déclaré') ||
        error.message.includes('modifiés') ||
        error.message.includes('modification')
      ) {
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
      message: "Échec de l'opération sur le ticket"
    });
  }
}

/**
 * Update ticket by tenant (title, description, category, priority, locationDetails)
 * PATCH /tenants/:tenantId/maintenance/tenant/tickets/:ticketId
 * Only allowed if ticket status is DECLARED
 */
export async function updateTenantTicketHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { ticketId } = req.params;
    const requesterUserId = requesterUserIdOf(req);

    // Validate request body
    const validatedData = updateTenantTicketSchema.parse(req.body);

    const ticket = await updateTenantTicket(tenantId, ticketId, validatedData, requesterUserId);

    res.status(200).json({
      success: true,
      data: ticket
    });
  } catch (error) {
    if (repondreErreurPortee(res, error)) {
      return;
    }
    console.error('Error updating ticket:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (
        error.message.includes('Déclaré') ||
        error.message.includes('modifiés') ||
        error.message.includes('modification')
      ) {
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
      message: 'Échec de la mise à jour du ticket'
    });
  }
}

/**
 * Delete ticket permanently
 * DELETE /tenants/:tenantId/maintenance/tenant/tickets/:ticketId
 */
export async function deleteTicketHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { ticketId } = req.params;
    const requesterUserId = requesterUserIdOf(req);

    await deleteTicket(tenantId, ticketId, requesterUserId);

    res.status(200).json({
      success: true,
      message: 'Ticket supprimé définitivement'
    });
  } catch (error) {
    if (repondreErreurPortee(res, error)) {
      return;
    }
    console.error('Error deleting ticket:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (
        error.message.includes('Déclaré') ||
        error.message.includes('Annulé') ||
        error.message.includes('supprimés')
      ) {
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
      message: 'Échec de la suppression du ticket'
    });
  }
}

/**
 * Add a comment to a ticket
 * POST /tenants/:tenantId/maintenance/tenant/tickets/:ticketId/comments
 */
export async function addCommentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { ticketId } = req.params;
    const requesterUserId = requesterUserIdOf(req);

    // Validate request body
    const validatedData = createCommentSchema.parse(req.body);

    // Le demandeur commente SA demande : l'auteur est l'utilisateur connecté
    // (un collaborateur d'agence n'a pas de fiche contact), jamais un
    // identifiant du corps de la requête.
    const comment = await addRequesterComment(tenantId, ticketId, validatedData, requesterUserId);

    res.status(201).json({
      success: true,
      data: comment
    });
  } catch (error) {
    if (repondreErreurPortee(res, error)) {
      return;
    }
    console.error('Error adding comment:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (error.message.includes('requis')) {
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
      message: "Échec de l'ajout du commentaire"
    });
  }
}

/**
 * List all tickets for property managers (with advanced filters)
 * GET /tenants/:tenantId/maintenance/admin/tickets
 */
export async function listAllTicketsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);

    const filters: any = {};
    if (req.query.propertyId) {
      filters.propertyId = req.query.propertyId as string;
    }
    if (req.query.status) {
      filters.status = req.query.status as MaintenanceTicketStatus;
    }
    if (req.query.priority) {
      filters.priority = req.query.priority as MaintenanceTicketPriority;
    }
    if (req.query.assignedVendorId) {
      filters.assignedVendorId = req.query.assignedVendorId as string;
    }
    if (req.query.dateFrom) {
      filters.dateFrom = new Date(req.query.dateFrom as string);
    }
    if (req.query.dateTo) {
      filters.dateTo = new Date(req.query.dateTo as string);
    }

    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await getAllTickets(tenantId, filters, { page, limit });

    // Transform tickets from snake_case to camelCase
    const transformedTickets = result.tickets.map(transformTicketFields);

    res.status(200).json({
      success: true,
      data: transformedTickets,
      pagination: result.pagination
    });
  } catch (error) {
    if (repondreErreurPortee(res, error)) {
      return;
    }
    console.error('Error listing all tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Échec de la récupération de la liste des tickets'
    });
  }
}

/**
 * Get ticket by ID for managers (full details)
 * GET /tenants/:tenantId/maintenance/admin/tickets/:ticketId
 */
export async function getTicketHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { ticketId } = req.params;

    const ticket = await getTicketById(tenantId, ticketId);
    const transformedTicket = transformTicket(ticket);

    res.status(200).json({
      success: true,
      data: transformedTicket
    });
  } catch (error) {
    if (repondreErreurPortee(res, error)) {
      return;
    }
    console.error('Error getting ticket:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
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
      message: 'Échec de la récupération du ticket'
    });
  }
}

/**
 * Update ticket (status, priority, vendor assignment, resolution notes)
 * PATCH /tenants/:tenantId/maintenance/admin/tickets/:ticketId
 */
export async function updateTicketHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { ticketId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentification requise'
      });
      return;
    }

    // Validate request body
    const validatedData = updateTicketSchema.parse(req.body);

    const ticket = await updateTicket(tenantId, ticketId, validatedData, actorUserId);

    res.status(200).json({
      success: true,
      data: ticket
    });
  } catch (error) {
    if (repondreErreurPortee(res, error)) {
      return;
    }
    // Safe error logging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating ticket:', errorMessage);

    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (error.message.includes('invalide') || error.message.includes('inactif')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }

    // Handle Zod validation errors
    if (error && typeof error === 'object' && 'issues' in error) {
      res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Données invalides',
        details: (error as any).issues
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Échec de la mise à jour du ticket'
    });
  }
}

/**
 * Add a manager comment to a ticket
 * POST /tenants/:tenantId/maintenance/admin/tickets/:ticketId/comments
 */
export async function addManagerCommentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { ticketId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentification requise'
      });
      return;
    }

    // Validate request body
    const validatedData = createCommentSchema.parse(req.body);

    const comment = await addManagerComment(tenantId, ticketId, validatedData, actorUserId);

    res.status(201).json({
      success: true,
      data: comment
    });
  } catch (error) {
    if (repondreErreurPortee(res, error)) {
      return;
    }
    console.error('Error adding manager comment:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (error.message.includes('requis')) {
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
      message: "Échec de l'ajout du commentaire"
    });
  }
}

/**
 * Get maintenance history for a property
 * GET /tenants/:tenantId/maintenance/admin/properties/:propertyId/maintenance
 */
export async function getPropertyMaintenanceHistoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { propertyId } = req.params;

    const filters: any = {};
    if (req.query.status) {
      filters.status = req.query.status as MaintenanceTicketStatus;
    }
    if (req.query.category) {
      filters.category = req.query.category as MaintenanceTicketCategory;
    }

    const tickets = await getPropertyMaintenanceHistory(tenantId, propertyId, filters);

    // Transform tickets from snake_case to camelCase
    const transformedTickets = tickets.map(transformTicketFields);

    res.status(200).json({
      success: true,
      data: transformedTickets
    });
  } catch (error) {
    if (repondreErreurPortee(res, error)) {
      return;
    }
    console.error('Error getting property maintenance history:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
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
      message: "Échec de la récupération de l'historique de maintenance"
    });
  }
}
