import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  uploadTemplate,
  listTemplates,
  activateTemplate,
  deactivateTemplate,
  setDefaultTemplate,
  deleteTemplate
} from '../services/document-template-service';
import { DocumentType, DocumentTemplateStatus } from '@prisma/client';
import { badRequest } from '../lib/errors';

/**
 * Un modele ne sort jamais avec son chemin de stockage disque (`storage_path`)
 * ni le nom de fichier interne : AGENTS.md, fichiers uploades.
 */
export function toTemplateDto<T extends { storage_path?: unknown; stored_filename?: unknown }>(
  template: T
): Omit<T, 'storage_path' | 'stored_filename'> {
  const { storage_path: _storagePath, stored_filename: _storedFilename, ...safe } = template;
  return safe;
}

/**
 * These routes are all mounted under `/tenants/:tenantId/documents/*` behind
 * `requireTenantAccess`, so `req.tenantContext.tenantId` is always the
 * caller's own, verified agency. There is no legitimate flow where a mutating
 * handler here should manage a *global* template (tenant_id null) — that
 * would let any agency user activate/deactivate/default/delete a template
 * shared by every tenant. `getOwnTenantId` refuses instead of silently
 * falling back to the "global" (null tenant) case the service layer accepts
 * for read-only listing.
 */
function getOwnTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) {
    throw badRequest('Contexte tenant requis pour gérer les modèles de documents.');
  }
  return tenantId;
}

const uploadTemplateSchema = z.object({
  docType: z.enum(['LEASE_HABITATION', 'LEASE_COMMERCIAL', 'RENT_RECEIPT', 'RENT_STATEMENT']),
  name: z.string().min(1).max(255)
});

const updateTemplateSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional()
});

/*
 * Les erreurs partent au middleware `errorHandler` (`next(error)`) plutot que
 * d'etre mises en forme ici.
 *
 * Chaque handler renvoyait auparavant `error.message` avec un 400. Pour une
 * erreur metier, le message etait juste ; pour une erreur Prisma, il exposait
 * au navigateur la trace complete — chemin absolu du fichier source du
 * serveur, numero de ligne, extrait de code et noms techniques des colonnes.
 * Le middleware, lui, traduit les codes Prisma connus en messages metier et
 * tait le reste en production.
 *
 * Les erreurs metier du service portent desormais leur propre statut (voir
 * `lib/errors`) : le 404 d'un modele introuvable reste un 404.
 */

/**
 * Upload a template
 * POST /api/v1/templates/upload
 */
export async function uploadTemplateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getOwnTenantId(req);
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'Fichier requis'
      });
      return;
    }

    // Validate request body
    const validatedData = uploadTemplateSchema.parse(req.body);

    const template = await uploadTemplate(
      tenantId,
      validatedData.docType as DocumentType,
      req.file.buffer,
      req.file.originalname,
      validatedData.name,
      actorUserId
    );

    res.status(201).json({
      success: true,
      data: toTemplateDto(template),
      message: 'Template téléchargé avec succès'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List templates
 * GET /api/v1/templates
 */
export async function listTemplatesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.tenantContext?.tenantId || null;
    const { docType, status } = req.query;

    const filters: any = {};
    if (docType) {
      filters.docType = docType as DocumentType;
    }
    if (status) {
      filters.status = status as DocumentTemplateStatus;
    }

    const templates = await listTemplates(tenantId, filters);

    res.json({
      success: true,
      data: templates.map(toTemplateDto)
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update template (activate/deactivate)
 * PATCH /api/v1/templates/:id
 */
export async function updateTemplateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getOwnTenantId(req);
    const { id } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    const validatedData = updateTemplateSchema.parse(req.body);

    let template;
    if (validatedData.status === 'ACTIVE') {
      template = await activateTemplate(tenantId, id, actorUserId);
    } else if (validatedData.status === 'INACTIVE') {
      template = await deactivateTemplate(tenantId, id, actorUserId);
    } else {
      res.status(400).json({
        success: false,
        message: 'Statut invalide'
      });
      return;
    }

    res.json({
      success: true,
      data: toTemplateDto(template)
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Set template as default
 * POST /api/v1/templates/:id/set-default
 */
export async function setDefaultTemplateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getOwnTenantId(req);
    const { id } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    const template = await setDefaultTemplate(tenantId, id, actorUserId);

    res.json({
      success: true,
      data: toTemplateDto(template),
      message: 'Template défini par défaut'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete template
 * DELETE /api/v1/templates/:id
 */
export async function deleteTemplateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getOwnTenantId(req);
    const { id } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    await deleteTemplate(tenantId, id, actorUserId);

    res.json({
      success: true,
      message: 'Template supprimé'
    });
  } catch (error) {
    next(error);
  }
}
