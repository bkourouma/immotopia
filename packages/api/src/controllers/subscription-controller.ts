import { Request, Response } from 'express';
import {
  createSubscription,
  updateSubscription,
  getSubscriptionByTenantId,
  cancelSubscription
} from '../services/subscription-service';
import {
  createInvoice,
  updateInvoice,
  getInvoiceById,
  listInvoices,
  markInvoiceAsPaid
} from '../services/invoice-service';
import { CreateSubscriptionRequest, UpdateSubscriptionRequest } from '../types/subscription-types';
import { CreateInvoiceRequest, UpdateInvoiceRequest as UpdateInvoiceRequestType } from '../types/subscription-types';
import { z } from 'zod';

// Validation schemas
const createSubscriptionSchema = z.object({
  tenantId: z.string().uuid(),
  planKey: z.enum(['BASIC', 'PRO', 'ELITE']),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']),
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED']).optional(),
  startAt: z.string().datetime().optional(),
  currentPeriodStart: z.string().datetime().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional()
});

const updateSubscriptionSchema = z.object({
  planKey: z.enum(['BASIC', 'PRO', 'ELITE']).optional(),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).optional(),
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED']).optional(),
  cancelAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional()
});

const createInvoiceSchema = z.object({
  subscriptionId: z.string().uuid().optional(),
  amountTotal: z.number().positive(),
  currency: z.string().default('FCFA'),
  dueDate: z.string().datetime(),
  issueDate: z.string().datetime().optional(),
  notes: z.string().optional()
});

const updateInvoiceSchema = z.object({
  status: z.enum(['DRAFT', 'ISSUED', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED']).optional(),
  paidAt: z.string().datetime().nullable().optional(),
  notes: z.string().optional()
});

/**
 * Get subscription for a tenant
 * GET /api/admin/tenants/:tenantId/subscription
 */
export async function getSubscriptionHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;
    const subscription = await getSubscriptionByTenantId(tenantId);

    if (!subscription) {
      res.status(404).json({ success: false, message: 'Abonnement introuvable.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: subscription
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Create subscription for a tenant
 * POST /api/admin/tenants/:tenantId/subscription
 */
export async function createSubscriptionHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;

    // Validate request body
    const validationResult = createSubscriptionSchema.safeParse({
      ...req.body,
      tenantId
    });
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: validationResult.error.errors
      });
      return;
    }

    const data = validationResult.data as CreateSubscriptionRequest;
    const subscription = await createSubscription(data, req.user.userId);

    res.status(201).json({
      success: true,
      message: 'Abonnement créé avec succès.',
      data: subscription
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Update subscription
 * PATCH /api/admin/tenants/:tenantId/subscription
 */
export async function updateSubscriptionHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;

    // Validate request body
    const validationResult = updateSubscriptionSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: validationResult.error.errors
      });
      return;
    }

    const data = validationResult.data as UpdateSubscriptionRequest;
    const subscription = await updateSubscription(tenantId, data, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Abonnement mis à jour avec succès.',
      data: subscription
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
 * Cancel subscription
 * POST /api/admin/tenants/:tenantId/subscription/cancel
 */
export async function cancelSubscriptionHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;
    const cancelAt = req.body.cancelAt ? new Date(req.body.cancelAt) : undefined;

    const subscription = await cancelSubscription(tenantId, cancelAt, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Abonnement annulé avec succès.',
      data: subscription
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
 * List invoices for a tenant
 * GET /api/admin/tenants/:tenantId/invoices
 */
export async function listInvoicesHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;

    const filters = {
      status: req.query.status as any,
      subscriptionId: req.query.subscriptionId as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20
    };

    const result = await listInvoices(tenantId, filters);

    res.status(200).json({
      success: true,
      data: result.invoices,
      pagination: result.pagination
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Create invoice
 * POST /api/admin/tenants/:tenantId/invoices
 */
export async function createInvoiceHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;

    // Validate request body
    const validationResult = createInvoiceSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: validationResult.error.errors
      });
      return;
    }

    const data = validationResult.data as CreateInvoiceRequest;
    const invoice = await createInvoice(
      {
        ...data,
        tenantId,
        issueDate: data.issueDate ? new Date(data.issueDate) : undefined,
        dueDate: new Date(data.dueDate)
      },
      req.user.userId
    );

    res.status(201).json({
      success: true,
      message: 'Facture créée avec succès.',
      data: invoice
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Get invoice by ID
 * GET /api/admin/invoices/:invoiceId
 */
export async function getInvoiceHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { invoiceId } = req.params;
    const invoice = await getInvoiceById(invoiceId);

    if (!invoice) {
      res.status(404).json({ success: false, message: 'Facture introuvable.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Update invoice
 * PATCH /api/admin/invoices/:invoiceId
 */
export async function updateInvoiceHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { invoiceId } = req.params;

    // Validate request body
    const validationResult = updateInvoiceSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: validationResult.error.errors
      });
      return;
    }

    const data = validationResult.data as UpdateInvoiceRequestType;
    const invoice = await updateInvoice(
      invoiceId,
      {
        ...data,
        paidAt: data.paidAt ? new Date(data.paidAt) : undefined
      },
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: 'Facture mise à jour avec succès.',
      data: invoice
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
 * Mark invoice as paid
 * POST /api/admin/invoices/:invoiceId/mark-paid
 */
export async function markInvoicePaidHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { invoiceId } = req.params;
    const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : undefined;

    const invoice = await markInvoiceAsPaid(invoiceId, paidAt, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Facture marquée comme payée.',
      data: invoice
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




