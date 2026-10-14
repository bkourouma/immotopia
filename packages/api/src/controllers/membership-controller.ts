import { Request, Response } from 'express';
import {
  listMembers,
  listAssignableMembers,
  getMemberById,
  updateMemberRoles,
  disableMember,
  enableMember,
  resetMemberPassword,
  revokeMemberSessions,
  ListMembersFilters
} from '../services/membership-service';
import { z } from 'zod';
import { parsePagination } from '../utils/pagination-helper';
import { asyncHandler, UnauthorizedError } from '../middleware/error-middleware';

/**
 * Membres assignables (id, nom d'affichage, roles ; ACTIFS seulement).
 * GET /api/tenants/:tenantId/members/assignable
 */
export const listAssignableMembersHandler = asyncHandler(async (req: Request, res: Response) => {
  const members = await listAssignableMembers(req.params.tenantId);
  res.status(200).json({ success: true, data: { members } });
});

// Validation schemas
const updateMemberRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1)
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).optional()
});

/**
 * List members (collaborators) for a tenant
 * GET /api/tenants/:tenantId/users
 */
export async function listMembersHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;

    const filters: ListMembersFilters = {
      tenantId,
      search: req.query.search as string,
      status: req.query.status as any,
      roleId: req.query.roleId as string,
      ...parsePagination(req.query, { defaultPage: 1, defaultLimit: 20 })
    };

    const result = await listMembers(filters);

    res.status(200).json({
      success: true,
      data: {
        members: result.members,
        pagination: result.pagination
      }
    });
  } catch (error) {
    console.error('List members error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    const statusCode = error instanceof Error && errorMessage.includes('introuvable') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      ...(process.env.NODE_ENV !== 'production' && {
        error: error instanceof Error ? error.stack : undefined
      })
    });
  }
}

/**
 * Get member by ID
 * GET /api/tenants/:tenantId/users/:userId
 */
export async function getMemberHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId, userId } = req.params;
    const member = await getMemberById(userId, tenantId);

    if (!member) {
      res.status(404).json({ success: false, message: 'Membre introuvable.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: member
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Update member roles
 * PATCH /api/tenants/:tenantId/users/:userId
 */
export const updateMemberHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.userId) {
    throw new UnauthorizedError();
  }

  const { tenantId, userId } = req.params;

  // Validate request body
  const validationResult = updateMemberRolesSchema.safeParse(req.body);
  if (!validationResult.success) {
    res.status(400).json({
      success: false,
      message: 'Données invalides',
      errors: validationResult.error.errors
    });
    return;
  }

  const member = await updateMemberRoles(userId, tenantId, validationResult.data, req.user.userId);

  res.status(200).json({
    success: true,
    message: 'Rôles mis à jour avec succès.',
    data: member
  });
});

/**
 * Disable a member. L'acteur (`req.user.userId`) est transmis au service, qui refuse
 * l'auto-désactivation et la désactivation du dernier administrateur actif.
 * POST /api/tenants/:tenantId/users/:userId/disable
 */
export const disableMemberHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.userId) {
    throw new UnauthorizedError();
  }

  const { tenantId, userId } = req.params;
  const membership = await disableMember(userId, tenantId, req.user.userId);

  res.status(200).json({
    success: true,
    message: 'Membre désactivé avec succès.',
    data: membership
  });
});

/**
 * Enable a member
 * POST /api/tenants/:tenantId/users/:userId/enable
 */
export async function enableMemberHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId, userId } = req.params;
    const membership = await enableMember(userId, tenantId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Membre activé avec succès.',
      data: membership
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    if (errorMessage.includes('introuvable')) {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(400).json({ success: false, message: errorMessage });
    }
  }
}

/**
 * Reset member password
 * POST /api/tenants/:tenantId/users/:userId/reset-password
 */
export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId, userId } = req.params;

    // Validate request body (optional password)
    const validationResult = resetPasswordSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: validationResult.error.errors
      });
      return;
    }

    const newPassword = validationResult.data.newPassword;
    const result = await resetMemberPassword(userId, tenantId, newPassword, req.user.userId);

    res.status(200).json({
      success: true,
      message: result.password
        ? 'Mot de passe réinitialisé. Un lien de réinitialisation a également été envoyé au membre.'
        : 'Un lien de réinitialisation a été envoyé au membre. Ses sessions ont été révoquées.'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    if (errorMessage.includes('introuvable')) {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(400).json({ success: false, message: errorMessage });
    }
  }
}

/**
 * Revoke member sessions
 * POST /api/tenants/:tenantId/users/:userId/revoke-sessions
 */
export async function revokeSessionsHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId, userId } = req.params;
    await revokeMemberSessions(userId, tenantId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Sessions révoquées avec succès.'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    if (errorMessage.includes('introuvable')) {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(400).json({ success: false, message: errorMessage });
    }
  }
}
