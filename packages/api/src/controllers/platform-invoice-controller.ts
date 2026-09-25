import { Request, Response } from 'express';
import { z } from 'zod';
import { InvoiceStatus, PlatformPaymentMethod } from '@prisma/client';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  generateInvoiceForPeriod,
  getPlatformInvoice,
  issueCreditNote,
  issuePlatformInvoice,
  listPlatformInvoices,
  markPlatformInvoicePaid,
  renderPlatformInvoicePdf,
  serializePlatformInvoice
} from '../services/platform-invoice-service';

/**
 * Factures PLATFORM des abonnements (vague 3, lot A) : routes super-admin
 * (/api/admin, permissions PLATFORM_INVOICES_*) et routes de l'agence
 * (/api/tenants/:tenantId/subscription/invoices, requireTenantAccess).
 * Modele : property-media-controller.ts (asyncHandler + erreurs typees).
 * Reference : docs/architecture/PLAN-ABONNEMENTS.md (§6 quater).
 */

function actor(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) throw new BadRequestError('Authentification requise.');
  return userId;
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestError(
      'Données invalides',
      result.error.errors.map(e => ({ field: e.path.join('.') || '(racine)', message: e.message }))
    );
  }
  return result.data;
}

const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform(value => new Date(value));

const listQuerySchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

function sendPdf(res: Response, file: { filename: string; buffer: Buffer }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(file.buffer);
}

// ------------------------------------------------------------------ super-admin

/** GET /api/admin/tenants/:tenantId/platform-invoices?status&page&limit (brouillons compris) */
export const adminListInvoicesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = parse(listQuerySchema, req.query);
  const result = await listPlatformInvoices(req.params.tenantId, { ...query, includeDrafts: true });
  res.json({ success: true, data: result.invoices, pagination: result.pagination });
});

/** GET /api/admin/tenants/:tenantId/platform-invoices/:invoiceId */
export const adminGetInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getPlatformInvoice(req.params.tenantId, req.params.invoiceId, { includeDrafts: true });
  res.json({ success: true, data });
});

/** POST /api/admin/tenants/:tenantId/platform-invoices/generate { nature?, at?, issue? } */
export const adminGenerateInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = parse(
    z.object({
      nature: z.enum(['PERIOD', 'OVERAGE']).optional(),
      at: isoDate.optional(),
      issue: z.boolean().optional()
    }),
    req.body ?? {}
  );
  const result = await generateInvoiceForPeriod(req.params.tenantId, {
    nature: body.nature,
    at: body.at,
    issue: body.issue,
    actorUserId: actor(req)
  });
  if (!result) {
    res.json({ success: true, data: null, created: false });
    return;
  }
  res.status(result.created ? 201 : 200).json({
    success: true,
    data: serializePlatformInvoice(result.invoice, { withLines: true }),
    created: result.created
  });
});

/** POST /api/admin/tenants/:tenantId/platform-invoices/:invoiceId/issue */
export const adminIssueInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await issuePlatformInvoice(req.params.tenantId, req.params.invoiceId, actor(req));
  res.json({ success: true, data: serializePlatformInvoice(invoice, { withLines: true }) });
});

/** POST /api/admin/tenants/:tenantId/platform-invoices/:invoiceId/mark-paid { method, reference?, paidAt?, note? } */
export const adminMarkPaidHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = parse(
    z.object({
      method: z.nativeEnum(PlatformPaymentMethod),
      reference: z.string().trim().max(200).optional(),
      paidAt: isoDate.optional(),
      note: z.string().trim().max(2000).optional()
    }),
    req.body ?? {}
  );
  const result = await markPlatformInvoicePaid(req.params.tenantId, req.params.invoiceId, body, actor(req));
  const invoice = await getPlatformInvoice(req.params.tenantId, req.params.invoiceId, { includeDrafts: true });
  res.json({ success: true, data: { invoice, payment: result.payment, subscription: result.subscription } });
});

/** POST /api/admin/tenants/:tenantId/platform-invoices/:invoiceId/credit-note { reason, reissuePending? } */
export const adminCreditNoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = parse(
    z.object({ reason: z.string().trim().min(1).max(2000), reissuePending: z.boolean().optional() }),
    req.body ?? {}
  );
  const note = await issueCreditNote(req.params.tenantId, req.params.invoiceId, body, actor(req));
  res.status(201).json({ success: true, data: serializePlatformInvoice(note, { withLines: true }) });
});

/** GET /api/admin/tenants/:tenantId/platform-invoices/:invoiceId/pdf */
export const adminInvoicePdfHandler = asyncHandler(async (req: Request, res: Response) => {
  sendPdf(res, await renderPlatformInvoicePdf(req.params.tenantId, req.params.invoiceId, { includeDrafts: true }));
});

// ------------------------------------------------------------------ agence

/** GET /api/tenants/:tenantId/subscription/invoices?status&page&limit (jamais de brouillon) */
export const tenantListInvoicesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = parse(listQuerySchema, req.query);
  const result = await listPlatformInvoices(req.params.tenantId, { ...query, includeDrafts: false });
  res.json({ success: true, data: result.invoices, pagination: result.pagination });
});

/** GET /api/tenants/:tenantId/subscription/invoices/:invoiceId */
export const tenantGetInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getPlatformInvoice(req.params.tenantId, req.params.invoiceId);
  res.json({ success: true, data });
});

/** GET /api/tenants/:tenantId/subscription/invoices/:invoiceId/pdf */
export const tenantInvoicePdfHandler = asyncHandler(async (req: Request, res: Response) => {
  sendPdf(res, await renderPlatformInvoicePdf(req.params.tenantId, req.params.invoiceId));
});
