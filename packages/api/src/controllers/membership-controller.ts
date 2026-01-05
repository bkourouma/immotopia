import { Request, Response } from 'express';
import {
  listMembers,
  getMemberById,
  updateMemberRoles,
  disableMember,
  enableMember,
  resetMemberPassword,
  revokeMemberSessions,
  ListMembersFilters
} from '../services/membership-service';
import { z } from 'zod';

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
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20
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
export async function updateMemberHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
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

    const data = validationResult.data;
    const member = await updateMemberRoles(userId, tenantId, data, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Rôles mis à jour avec succès.',
      data: member
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
 * Disable a member
 * POST /api/tenants/:tenantId/users/:userId/disable
 */
export async function disableMemberHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId, userId } = req.params;
    const membership = await disableMember(userId, tenantId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Membre désactivé avec succès.',
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
      message: 'Mot de passe réinitialisé avec succès.',
      data: {
        // Only return password in development/testing
        ...(process.env.NODE_ENV !== 'production' && { password: result.password })
      }
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
