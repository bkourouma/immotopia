import { RESERVED_ROLE_KEYS } from '../lib/patrimoine/personal-permissions';
import { Request, Response } from 'express';
import { prisma } from '../utils/database';
import { RoleScope } from '@prisma/client';
import { userHasTenantAccess } from '../utils/tenant-access';

/**
 * List roles
 * GET /api/roles
 */
export async function listRolesHandler(req: Request, res: Response): Promise<void> {
  try {
    const rawScope = Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;
    const scope =
      typeof rawScope === 'string' && rawScope.trim().length > 0 ? rawScope.trim().toUpperCase() : undefined;

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
    // Rôles réservés : visibles du seul super-admin.
    if (req.user?.globalRole !== 'SUPER_ADMIN') {
      where.key = { notIn: RESERVED_ROLE_KEYS };
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

      roles = scope ? allRoles.filter(r => String(r.scope).toUpperCase() === scope) : allRoles;

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
export async function listPermissionsHandler(_req: Request, res: Response): Promise<void> {
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

/**
 * Accès aux menus par rôle
 * GET /api/roles/menu-access
 */
export async function listMenuAccessHandler(_req: Request, res: Response): Promise<void> {
  try {
    const { getAllMenuAccess } = await import('../services/role-menu-service');
    const data = await getAllMenuAccess();
    res.status(200).json({ success: true, data });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Menus coupés pour l'utilisateur courant
 * GET /api/roles/menu-access/me
 *
 * L'interface n'a pas besoin de connaître les rôles de la personne connectée
 * pour masquer une entrée : elle a besoin de savoir quelles entrées masquer.
 * On renvoie donc ces clés, plus les permissions effectives dans l'agence
 * (l'interface masque aussi les entrées que le rôle ne peut pas ouvrir).
 */
export async function getMyMenuAccessHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const rawTenantId = Array.isArray(req.query.tenantId) ? req.query.tenantId[0] : req.query.tenantId;
    const queryTenantId =
      typeof rawTenantId === 'string' && rawTenantId.trim().length > 0 ? rawTenantId.trim() : undefined;

    // Un tenantId fourni en query n'est pas garanti par un middleware de route
    // (cette route est accessible sans agence, pour un utilisateur plateforme) :
    // s'il en fournit un, on vérifie ici qu'il y appartient réellement, sinon
    // n'importe quel utilisateur authentifié pourrait lire les menus coupés
    // d'une autre agence.
    if (queryTenantId) {
      const hasAccess = await userHasTenantAccess(req.user.userId, queryTenantId, req.user.globalRole);
      if (!hasAccess) {
        res.status(403).json({ success: false, message: 'Accès refusé à cette agence.' });
        return;
      }
    }

    const tenantId = queryTenantId ?? req.tenantContext?.tenantId;

    const { getDisabledMenusForUser } = await import('../services/role-menu-service');
    const disabledMenuKeys = await getDisabledMenusForUser(req.user.userId, tenantId);

    // Permissions effectives dans l'agence : l'interface en déduit les entrées
    // que le rôle ne peut de toute façon pas ouvrir (BUG-2026-10-02-010). Sans
    // agence (utilisateur plateforme), le champ est absent : rien n'est déduit.
    let permissions: string[] | undefined;
    if (tenantId) {
      const { getUserPermissions } = await import('../services/permission-service');
      permissions = await getUserPermissions(req.user.userId, tenantId);
    }

    res.status(200).json({ success: true, data: { disabledMenuKeys, ...(permissions ? { permissions } : {}) } });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Remplace les accès aux menus d'un rôle
 * PUT /api/roles/menu-access/:roleKey
 *
 * `roleKey` et non `id` : deux des personas de l'interface — propriétaire et
 * locataire — n'ont pas de ligne dans `roles`, donc pas d'identifiant. Les
 * pseudo-clés `PORTAL_OWNER` / `PORTAL_RENTER` les désignent.
 */
export async function updateMenuAccessHandler(req: Request, res: Response): Promise<void> {
  try {
    const { roleKey } = req.params;
    const { menus } = req.body;

    if (!roleKey || roleKey.trim().length === 0) {
      res.status(400).json({ success: false, message: 'Clé de rôle manquante.' });
      return;
    }

    if (!menus || typeof menus !== 'object' || Array.isArray(menus)) {
      res.status(400).json({
        success: false,
        message: 'menus doit être un objet { clé de menu: booléen }.'
      });
      return;
    }

    const invalid = Object.entries(menus).find(
      ([menuKey, enabled]) => typeof menuKey !== 'string' || typeof enabled !== 'boolean'
    );
    if (invalid) {
      res.status(400).json({
        success: false,
        message: `Entrée de menu invalide: ${invalid[0]}. Un booléen est attendu.`
      });
      return;
    }

    const { PORTAL_OWNER_ROLE_KEY, PORTAL_RENTER_ROLE_KEY, replaceMenuAccessForRole } =
      await import('../services/role-menu-service');

    // Un rôle inexistant n'est accepté que s'il s'agit d'un pseudo-rôle connu :
    // sinon une faute de frappe créerait silencieusement des lignes orphelines.
    const isPortalRole = roleKey === PORTAL_OWNER_ROLE_KEY || roleKey === PORTAL_RENTER_ROLE_KEY;
    if (!isPortalRole) {
      const role = await prisma.role.findUnique({ where: { key: roleKey }, select: { id: true } });
      if (!role) {
        res.status(404).json({ success: false, message: `Rôle inconnu: ${roleKey}.` });
        return;
      }
    }

    const data = await replaceMenuAccessForRole(roleKey, menus as Record<string, boolean>);

    res.status(200).json({
      success: true,
      data,
      message: 'Menus mis à jour avec succès.'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}
