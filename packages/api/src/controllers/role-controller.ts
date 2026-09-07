import { Request, Response } from 'express';
import { prisma } from '../utils/database';
import { RoleScope } from '@prisma/client';

/**
 * List roles
 * GET /api/roles
 */
export async function listRolesHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawScope = Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;
    const scope =
      typeof rawScope === 'string' && rawScope.trim().length > 0
        ? rawScope.trim().toUpperCase()
        : undefined;

    if (scope && scope !== RoleScope.PLATFORM && scope !== RoleScope.TENANT) {
      res.status(400).json({
        success: false,
        message: `Scope invalide: ${scope}. Valeurs attendues: PLATFORM, TENANT.`
      });
      return;
    }

    const where: any = {};
    if (scope) {
      where.scope = scope;
    }

    let roles;
    try {
      roles = await prisma.role.findMany({
        where,
        select: {
          id: true,
          key: true,
          name: true,
          description: true,
          scope: true
        },
        orderBy: { name: 'asc' }
      });
    } catch (filteredQueryError) {
      // Fallback defensif: en cas d'erreur liée au filtre scope en base,
      // on renvoie les rôles et on filtre côté applicatif.
      const allRoles = await prisma.role.findMany({
        select: {
          id: true,
          key: true,
          name: true,
          description: true,
          scope: true
        },
        orderBy: { name: 'asc' }
      });

      roles = scope
        ? allRoles.filter((r) => String(r.scope).toUpperCase() === scope)
        : allRoles;

      console.warn('[roles] filtered query failed, fallback applied:', filteredQueryError);
    }

    res.status(200).json({
      success: true,
      data: roles
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Get role with permissions
 * GET /api/roles/:id
 */
export async function getRoleHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: {
              select: {
                id: true,
                key: true,
                description: true
              }
            }
          }
        }
      }
    });

    if (!role) {
      res.status(404).json({
        success: false,
        message: 'Rôle non trouvé.'
      });
      return;
    }

    // Format response
    const formattedRole = {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      scope: role.scope,
      permissions: role.permissions.map(rp => ({
        id: rp.permission.id,
        key: rp.permission.key,
        description: rp.permission.description
      }))
    };

    res.status(200).json({
      success: true,
      data: formattedRole
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * List all permissions
 * GET /api/roles/permissions
 */
export async function listPermissionsHandler(req: Request, res: Response): Promise<void> {
  try {
    const permissions = await prisma.permission.findMany({
      select: {
        id: true,
        key: true,
        description: true
      },
      orderBy: { key: 'asc' }
    });

    res.status(200).json({
      success: true,
      data: permissions
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Update role permissions
 * PATCH /api/roles/:id/permissions
 */
export async function updateRolePermissionsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { permissionIds } = req.body;

    if (!Array.isArray(permissionIds)) {
      res.status(400).json({
        success: false,
        message: 'permissionIds doit être un tableau.'
      });
      return;
    }

    // Verify role exists
    const role = await prisma.role.findUnique({
      where: { id }
    });

    if (!role) {
      res.status(404).json({
        success: false,
        message: 'Rôle non trouvé.'
      });
      return;
    }

    // Verify all permissions exist
    const permissions = await prisma.permission.findMany({
      where: {
        id: {
          in: permissionIds
        }
      }
    });

    if (permissions.length !== permissionIds.length) {
      res.status(400).json({
        success: false,
        message: 'Une ou plusieurs permissions sont invalides.'
      });
      return;
    }

    // Update role permissions using transaction
    await prisma.$transaction(async tx => {
      // Delete existing role permissions
      await tx.rolePermission.deleteMany({
        where: { roleId: id }
      });

      // Create new role permissions
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId: string) => ({
            roleId: id,
            permissionId
          }))
        });
      }
    });

    // Invalidate permission cache for all users with this role
    const { invalidateAllUserPermissionCache } = await import('../services/permission-service');
    const usersWithRole = await prisma.userRole.findMany({
      where: { roleId: id },
      select: { userId: true }
    });

    for (const userRole of usersWithRole) {
      invalidateAllUserPermissionCache(userRole.userId);
    }

    // Return updated role with permissions
    const updatedRole = await prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: {
              select: {
                id: true,
                key: true,
                description: true
              }
            }
          }
        }
      }
    });

    const formattedRole = {
      id: updatedRole!.id,
      key: updatedRole!.key,
      name: updatedRole!.name,
      description: updatedRole!.description,
      scope: updatedRole!.scope,
      permissions: updatedRole!.permissions.map(rp => ({
        id: rp.permission.id,
        key: rp.permission.key,
        description: rp.permission.description
      }))
    };

    res.status(200).json({
      success: true,
      data: formattedRole,
      message: 'Permissions mises à jour avec succès.'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}
