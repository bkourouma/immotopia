import { Request, Response } from 'express';
import {
  inviteCollaborator,
  acceptInvitation,
  resendInvitation,
  revokeInvitation,
  listInvitations
} from '../services/invitation-service';
import { asyncHandler, UnauthorizedError } from '../middleware/error-middleware';
import { z } from 'zod';

// Validation schemas
const inviteCollaboratorSchema = z.object({
  // Normalise comme `registerSchema` (validation-middleware.ts) : sans ca, le
  // garde anti-super-admin (inviteCollaborator) se contournait par variation
  // de casse (`SuperAdmin@…` invite alors que le compte est `superadmin@…`),
  // et `Invitation.email` finissait a casse variable au fil du temps.
  email: z.string().email().toLowerCase().trim(),
  roleIds: z.array(z.string().uuid()).min(1)
});

const acceptInvitationSchema = z.object({
  token: z.string().uuid(),
  // Requis uniquement pour un NOUVEAU compte ; un compte existant n'en a pas
  // besoin (voir acceptInvitation, qui n'accepte jamais de reecrire un mot
  // de passe existant). La validation de sa presence/force reste faite par
  // le service, qui connait le contexte (nouveau vs existant).
  password: z.string().min(8).optional(),
  fullName: z.string().optional()
});

/**
 * Invite a collaborator to a tenant
 * POST /api/tenants/:tenantId/users/invite
 */
export const inviteCollaboratorHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.userId) {
    throw new UnauthorizedError();
  }

  const { tenantId } = req.params;

  const data = inviteCollaboratorSchema.parse(req.body);
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
});

/**
 * Accept an invitation
 * POST /api/auth/invitations/accept
 *
 * Route publique montee avec `optionalAuthenticate` (auth-routes.ts) : un
 * nouveau compte n'a pas de session, un compte EXISTANT doit en avoir une —
 * la sienne — pour que le service accepte de rattacher l'agence sans
 * toucher au mot de passe.
 */
export const acceptInvitationHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = acceptInvitationSchema.parse(req.body);
  const result = await acceptInvitation({
    ...data,
    requestingUserId: req.user?.userId
  });

  res.status(200).json({
    success: true,
    message: 'Invitation acceptée avec succès.',
    data: {
      membership: {
        id: result.membership.id,
        status: result.membership.status,
        tenantId: result.membership.tenantId
      },
      user: result.user
    }
  });
});

/**
 * Resend invitation email
 * POST /api/tenants/:tenantId/users/invitations/:invitationId/resend
 */
export const resendInvitationHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.userId) {
    throw new UnauthorizedError();
  }

  // `tenantId` vient de l'URL, deja verifiee par `requireTenantAccess` (le
  // routeur) : c'est elle, jamais un id fourni par le corps de la requete,
  // qui borne la recherche cote service (IDOR entre agences sinon).
  const { tenantId, invitationId } = req.params;
  const result = await resendInvitation(invitationId, tenantId, req.user.userId);

  // acceptUrl porte le jeton en clair : reserve au super-admin plateforme
  // (copier/coller du lien, F2). Un administrateur d'agence ne le voit
  // jamais — l'email/WhatsApp reste l'unique canal de remise du jeton.
  const isSuperAdmin = req.user.globalRole === 'SUPER_ADMIN';

  res.status(200).json({
    success: true,
    message: 'Invitation renvoyée avec succès.',
    data: {
      expiresAt: result.expiresAt,
      emailSent: result.emailSent,
      ...(isSuperAdmin ? { acceptUrl: result.acceptUrl } : {})
    }
  });
});

/**
 * Revoke an invitation
 * DELETE /api/tenants/:tenantId/users/invitations/:invitationId
 */
export const revokeInvitationHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.userId) {
    throw new UnauthorizedError();
  }

  const { tenantId, invitationId } = req.params;
  await revokeInvitation(invitationId, tenantId, req.user.userId);

  res.status(200).json({
    success: true,
    message: 'Invitation révoquée avec succès.'
  });
});

/**
 * List invitations for a tenant
 * GET /api/tenants/:tenantId/invitations
 */
export const listInvitationsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.userId) {
    throw new UnauthorizedError();
  }

  const { tenantId } = req.params;
  const invitations = await listInvitations(tenantId);

  res.status(200).json({
    success: true,
    data: invitations
  });
});
