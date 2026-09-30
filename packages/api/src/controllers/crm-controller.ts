import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import {
  createContactSchema,
  updateContactSchema,
  createDealSchema,
  updateDealSchema,
  createActivitySchema,
  convertContactSchema
} from '../types/crm-types';
import {
  createContact,
  getContactById,
  listContacts,
  updateContact,
  deleteContact,
  convertLeadToClient,
  deactivateContactRole,
  updateContactRoles
} from '../services/crm-contact-service';
import {
  assignTagToContact,
  removeTagFromContact,
  getContactTags,
  listTags,
  createTag
} from '../services/crm-tag-service';
import { createDeal, getDealById, listDeals, updateDeal } from '../services/crm-deal-service';
import { createActivity, listActivities } from '../services/crm-activity-service';
import { getDashboard } from '../services/crm-dashboard-service';
import { respondWithAppError } from '../utils/app-error-response';
import { parsePagination } from '../utils/pagination-helper';

/**
 * Create a new contact
 * POST /tenants/:tenantId/crm/contacts
 */
export async function createContactHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const actorUserId = req.user?.userId;

    // Validate request body
    const validatedData = createContactSchema.parse(req.body);

    const contact = await createContact(tenantId, validatedData, actorUserId);

    res.status(201).json({
      success: true,
      data: contact
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    console.error('Error creating contact:', error);
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          error: 'Conflict',
          message: error.message
        });
        return;
      }
      if (error.message.includes('required')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to create contact',
      details:
        process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
    });
  }
}

/**
 * Get contact by ID
 * GET /tenants/:tenantId/crm/contacts/:contactId
 */
export async function getContactHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { contactId } = req.params;

    const contact = await getContactById(tenantId, contactId);

    if (!contact) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Contact not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to get contact'
    });
  }
}

/**
 * List contacts with filtering
 * GET /tenants/:tenantId/crm/contacts
 */
export async function listContactsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);

    const filters = {
      status: req.query.status as string | undefined,
      source: req.query.source as string | undefined,
      assignedTo: req.query.assignedTo as string | undefined,
      tag: req.query.tag as string | undefined,
      search: req.query.search as string | undefined,
      ...parsePagination(req.query)
    };

    const result = await listContacts(tenantId, filters);

    res.status(200).json({
      success: true,
      contacts: result.contacts,
      pagination: result.pagination
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    console.error('Error listing contacts:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to list contacts',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
}

/**
 * Update contact
 * PATCH /tenants/:tenantId/crm/contacts/:contactId
 */
export async function updateContactHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { contactId } = req.params;
    const actorUserId = req.user?.userId;

    // Validate request body
    const validatedData = updateContactSchema.parse(req.body);

    const contact = await updateContact(tenantId, contactId, validatedData, actorUserId);

    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          error: 'Conflict',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to update contact'
    });
  }
}

/**
 * Delete contact
 * DELETE /tenants/:tenantId/crm/contacts/:contactId
 */
export async function deleteContactHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { contactId } = req.params;
    const actorUserId = req.user?.userId;

    await deleteContact(tenantId, contactId, actorUserId);

    res.status(200).json({
      success: true,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: error.message
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to delete contact'
    });
  }
}

/**
 * Get contact tags
 * GET /tenants/:tenantId/crm/contacts/:contactId/tags
 */
export async function getContactTagsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { contactId } = req.params;

    const tags = await getContactTags(tenantId, contactId);

    res.status(200).json({
      success: true,
      data: tags
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: error.message
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to get contact tags'
    });
  }
}

/**
 * Assign tag to contact
 * POST /tenants/:tenantId/crm/contacts/:contactId/tags
 */
export async function assignTagHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { contactId } = req.params;
    const { tagId } = req.body;

    if (!tagId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'tagId is required'
      });
      return;
    }

    await assignTagToContact(tenantId, contactId, tagId);

    res.status(200).json({
      success: true,
      message: 'Tag assigned successfully'
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: error.message
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to assign tag'
    });
  }
}

/**
 * Remove tag from contact
 * DELETE /tenants/:tenantId/crm/contacts/:contactId/tags/:tagId
 */
export async function removeTagHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { contactId, tagId } = req.params;

    await removeTagFromContact(tenantId, contactId, tagId);

    res.status(200).json({
      success: true,
      message: 'Tag removed successfully'
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: error.message
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to remove tag'
    });
  }
}

/**
 * List all tags for a tenant
 * GET /tenants/:tenantId/crm/tags
 */
export async function listTagsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);

    const tags = await listTags(tenantId);

    res.status(200).json({
      success: true,
      data: tags
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to list tags'
    });
  }
}

/**
 * Create a new tag
 * POST /tenants/:tenantId/crm/tags
 */
export async function createTagHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { name, color } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Tag name is required'
      });
      return;
    }

    const tag = await createTag(tenantId, name, color);

    res.status(201).json({
      success: true,
      data: tag
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    if (error instanceof Error && error.message.includes('already exists')) {
      res.status(409).json({
        success: false,
        error: 'Conflict',
        message: error.message
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to create tag'
    });
  }
}

/**
 * Create a new deal
 * POST /tenants/:tenantId/crm/deals
 */
export async function createDealHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const actorUserId = req.user?.userId;

    // Validate request body
    const validatedData = createDealSchema.parse(req.body);

    const deal = await createDeal(tenantId, validatedData, actorUserId);

    res.status(201).json({
      success: true,
      data: deal
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (error.message.includes('Budget max')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to create deal'
    });
  }
}

/**
 * Get deal by ID
 * GET /tenants/:tenantId/crm/deals/:dealId
 */
export async function getDealHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { dealId } = req.params;

    const deal = await getDealById(tenantId, dealId);

    if (!deal) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Deal not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: deal
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to get deal'
    });
  }
}

/**
 * List deals with filtering
 * GET /tenants/:tenantId/crm/deals
 */
export async function listDealsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);

    const filters = {
      type: req.query.type as 'ACHAT' | 'LOCATION' | undefined,
      stage: req.query.stage as string | undefined,
      assignedTo: req.query.assignedTo as string | undefined,
      contactId: req.query.contactId as string | undefined,
      ...parsePagination(req.query)
    };

    const result = await listDeals(tenantId, filters);

    res.status(200).json({
      success: true,
      deals: result.deals,
      pagination: result.pagination
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to list deals'
    });
  }
}

/**
 * Update deal
 * PATCH /tenants/:tenantId/crm/deals/:dealId
 */
export async function updateDealHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { dealId } = req.params;
    const actorUserId = req.user?.userId;

    // Validate request body
    const validatedData = updateDealSchema.parse(req.body);

    const deal = await updateDeal(tenantId, dealId, validatedData, actorUserId);

    res.status(200).json({
      success: true,
      data: deal
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (error.message.includes('modified by another user')) {
        res.status(409).json({
          success: false,
          error: 'Conflict',
          message: error.message
        });
        return;
      }
      if (error.message.includes('Budget max')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to update deal'
    });
  }
}

/**
 * Create a new activity
 * POST /tenants/:tenantId/crm/activities
 */
export async function createActivityHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const actorUserId = req.user?.userId;

    // Validate request body
    const validatedData = createActivitySchema.parse(req.body);

    const activity = await createActivity(tenantId, validatedData, actorUserId);

    res.status(201).json({
      success: true,
      data: activity
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (error.message.includes('required')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to create activity'
    });
  }
}

/**
 * List activities with filtering
 * GET /tenants/:tenantId/crm/activities
 */
export async function listActivitiesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);

    const filters = {
      contactId: req.query.contactId as string | undefined,
      dealId: req.query.dealId as string | undefined,
      type: req.query.type as string | undefined,
      createdBy: req.query.createdBy as string | undefined,
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      ...parsePagination(req.query)
    };

    const result = await listActivities(tenantId, filters);

    res.status(200).json({
      success: true,
      activities: result.activities,
      pagination: result.pagination
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to list activities'
    });
  }
}

/**
 * Convert lead to client
 * POST /tenants/:tenantId/crm/contacts/:contactId/convert
 */
export async function convertContactHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { contactId } = req.params;
    const actorUserId = req.user?.userId;

    // Validate request body
    const validatedData = convertContactSchema.parse(req.body);

    const contact = await convertLeadToClient(tenantId, contactId, validatedData.roles, actorUserId);

    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (error.message.includes('cannot be converted') || error.message.includes('not a lead')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to convert contact'
    });
  }
}

/**
 * Delete a contact role
 * DELETE /tenants/:tenantId/crm/contacts/:contactId/roles/:roleId
 */
export async function deactivateRoleHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { contactId, roleId } = req.params;
    const actorUserId = req.user?.userId;

    const role = await deactivateContactRole(tenantId, contactId, roleId, actorUserId);

    res.status(200).json({
      success: true,
      data: role,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to delete role'
    });
  }
}

/**
 * Update contact roles
 * PATCH /tenants/:tenantId/crm/contacts/:contactId/roles
 */
export async function updateRolesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { contactId } = req.params;
    const actorUserId = req.user?.userId;

    // Validate request body
    const validatedData = convertContactSchema.parse(req.body);

    const contact = await updateContactRoles(tenantId, contactId, validatedData.roles, actorUserId);

    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to update contact roles'
    });
  }
}

/**
 * Get CRM dashboard data
 * GET /tenants/:tenantId/crm/dashboard
 */
export async function getDashboardHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);

    const dashboard = await getDashboard(tenantId);

    res.status(200).json({
      success: true,
      data: dashboard
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to get dashboard data'
    });
  }
}
