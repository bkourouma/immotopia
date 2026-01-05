import { Request, Response } from 'express';
import { prisma } from '../utils/database';

/**
 * List roles
 * GET /api/roles
 */
export async function listRolesHandler(req: Request, res: Response): Promise<void> {
  try {
    const scope = req.query.scope as string | undefined;

    const where: any = {};
    if (scope) {
      where.scope = scope;
    }

    const roles = await prisma.role.findMany({
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

    res.status(200).json({
      success: true,
      data: roles
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}
