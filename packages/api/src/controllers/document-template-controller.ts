import { Request, Response } from 'express';
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

const uploadTemplateSchema = z.object({
  docType: z.enum(['LEASE_HABITATION', 'LEASE_COMMERCIAL', 'RENT_RECEIPT', 'RENT_STATEMENT']),
  name: z.string().min(1).max(255)
});

const updateTemplateSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional()
});

/**
 * Upload a template
 * POST /api/v1/templates/upload
 */
export async function uploadTemplateHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantContext?.tenantId || null;
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
      data: template,
      message: 'Template téléchargé avec succès'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: error.errors
      });
      return;
    }

    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors du téléchargement du template'
    });
  }
}

/**
 * List templates
 * GET /api/v1/templates
 */
export async function listTemplatesHandler(req: Request, res: Response): Promise<void> {
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
      data: templates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des templates'
    });
  }
}

/**
 * Update template (activate/deactivate)
 * PATCH /api/v1/templates/:id
 */
export async function updateTemplateHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantContext?.tenantId || null;
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
      data: template
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: error.errors
      });
      return;
    }

    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du template'
    });
  }
}

/**
 * Set template as default
 * POST /api/v1/templates/:id/set-default
 */
export async function setDefaultTemplateHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantContext?.tenantId || null;
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
      data: template,
      message: 'Template défini par défaut'
    });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la définition du template par défaut'
    });
  }
}

/**
 * Delete template
 * DELETE /api/v1/templates/:id
 */
export async function deleteTemplateHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.tenantContext?.tenantId || null;
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
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du template'
    });
  }
}


