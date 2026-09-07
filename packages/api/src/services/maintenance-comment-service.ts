import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { CreateCommentRequest } from '../types/maintenance-types';
import { MaintenanceTicketCommentAuthorType } from '@prisma/client';

/**
 * Add a comment to a ticket
 * @param tenantId - Tenant ID
 * @param ticketId - Ticket ID
 * @param data - Comment data
 * @param authorType - Author type (TENANT, MANAGER, SYSTEM)
 * @param authorUserId - User author (optional, for MANAGER type)
 * @param authorContactId - Contact author (optional, for TENANT type)
 * @returns Created comment
 */
export async function addComment(
  tenantId: string,
  ticketId: string,
  data: CreateCommentRequest,
  authorType: MaintenanceTicketCommentAuthorType,
  authorUserId?: string,
  authorContactId?: string
) {
  // Verify ticket exists and belongs to tenant
  const ticket = await prisma.maintenanceTicket.findFirst({
    where: {
      id: ticketId,
      tenant_id: tenantId
    }
  });

  if (!ticket) {
    throw new Error('Ticket introuvable');
  }

  // Validate author based on author type
  if (authorType === MaintenanceTicketCommentAuthorType.MANAGER && !authorUserId) {
    throw new Error('Un utilisateur est requis pour les commentaires de type MANAGER');
  }

  if (authorType === MaintenanceTicketCommentAuthorType.TENANT && !authorContactId) {
    throw new Error('Un contact est requis pour les commentaires de type TENANT');
  }

  // Create comment
  const comment = await prisma.maintenanceTicketComment.create({
    data: {
      tenant_id: tenantId,
      ticket_id: ticketId,
      author_type: authorType,
      content: data.content,
      author_user_id: authorUserId || null,
      author_contact_id: authorContactId || null
    },
    include: {
      authorUser: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      authorContact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    }
  });

  logger.info('Maintenance comment added', {
    commentId: comment.id,
    ticketId,
    tenantId,
    authorType
  });

  return comment;
}

/**
 * Get all comments for a ticket
 * @param tenantId - Tenant ID
 * @param ticketId - Ticket ID
 * @returns List of comments ordered by created_at
 */
export async function getTicketComments(tenantId: string, ticketId: string) {
  // Verify ticket exists and belongs to tenant
  const ticket = await prisma.maintenanceTicket.findFirst({
    where: {
      id: ticketId,
      tenant_id: tenantId
    }
  });

  if (!ticket) {
    throw new Error('Ticket introuvable');
  }

  // Get all comments ordered by creation date
  const comments = await prisma.maintenanceTicketComment.findMany({
    where: {
      ticket_id: ticketId,
      tenant_id: tenantId
    },
    include: {
      authorUser: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      authorContact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      }
    },
    orderBy: {
      created_at: 'asc'
    }
  });

  return comments;
}

/**
 * Add a manager comment to a ticket
 * @param tenantId - Tenant ID
 * @param ticketId - Ticket ID
 * @param data - Comment data
 * @param authorUserId - User author (required for MANAGER type)
 * @returns Created comment
 */
export async function addManagerComment(
  tenantId: string,
  ticketId: string,
  data: CreateCommentRequest,
  authorUserId: string
) {
  return addComment(tenantId, ticketId, data, MaintenanceTicketCommentAuthorType.MANAGER, authorUserId, undefined);
}
