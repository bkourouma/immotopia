import { Request, Response } from 'express';
import {
  inviteCollaborator,
  acceptInvitation,
  resendInvitation,
  revokeInvitation,
  listInvitations
} from '../services/invitation-service';
import { z } from 'zod';

// Validation schemas
const inviteCollaboratorSchema = z.object({
  email: z.string().email(),
  roleIds: z.array(z.string().uuid()).min(1)
});

const acceptInvitationSchema = z.object({
  token: z.string().uuid(),
  password: z.string().min(8),
  fullName: z.string().optional()
});

/**
 * Invite a collaborator to a tenant
 * POST /api/tenants/:tenantId/users/invite
 */
export async function inviteCollaboratorHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;

    // Validate request body
    const validationResult = inviteCollaboratorSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: validationResult.error.errors
      });
      return;
    }

    const data = validationResult.data;
    const result = await inviteCollaborator({
      email: data.email,
      tenantId,
      roleIds: data.roleIds,
      invitedByUserId: req.user.userId
    });

    // Le token n'est jamais renvoye par l'API : seul son hash est stocke en base et
    // seul le destinataire de l'email doit le connaitre.
    res.status(201).json({
      success: true,
      message: 'Invitation envoyée avec succès.',
      data: result.invitation
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Accept an invitation
 * POST /api/auth/invitations/accept
 */
export async function acceptInvitationHandler(req: Request, res: Response): Promise<void> {
  try {
    // Validate request body
    const validationResult = acceptInvitationSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: validationResult.error.errors
      });
      return;
    }

    const data = validationResult.data;
    const result = await acceptInvitation(data);

    res.status(200).json({
      success: true,
      message: 'Invitation acceptée avec succès.',
      data: {
        membership: result.membership,
        user: result.user
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Resend invitation email
 * POST /api/tenants/:tenantId/users/invitations/:invitationId/resend
 */
export async function resendInvitationHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { invitationId } = req.params;
    const result = await resendInvitation(invitationId, req.user.userId);

    // Comme a l'invitation, le nouveau token n'est jamais renvoye par l'API.
    res.status(200).json({
      success: true,
      message: 'Invitation renvoyée avec succès.',
      data: {
        expiresAt: result.expiresAt
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Revoke an invitation
 * DELETE /api/tenants/:tenantId/users/invitations/:invitationId
 */
export async function revokeInvitationHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { invitationId } = req.params;
    await revokeInvitation(invitationId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Invitation révoquée avec succès.'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * List invitations for a tenant
 * GET /api/tenants/:tenantId/invitations
 */
export async function listInvitationsHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;
    const invitations = await listInvitations(tenantId);

    res.status(200).json({
      success: true,
      data: invitations
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}
