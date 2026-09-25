import { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PlatformPaymentMethod } from '@prisma/client';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  getInvoiceCheckoutForTenant,
  getInvoicePayment,
  getInvoicePaymentProof,
  getPlatformPaymentAvailability,
  listInvoiceCheckouts,
  recordManualPayment,
  startInvoiceCheckout
} from '../services/platform-payment-service';
import {
  createExtensionRequest,
  handleExtensionRequest,
  listExtensionRequests,
  listSubscriptionSummaries,
  MAX_SUMMARY_TENANTS,
  updateSubscriptionItem
} from '../services/subscription-admin-extras-service';

/**
 * Vague 3, lot B : paiement de l'abonnement (en ligne et constat manuel),
 * modification d'un element, demandes d'extension, resume de la liste des
 * agences. Modele : property-media-controller.ts (asyncHandler + erreurs typees).
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

// ------------------------------------------------------------------ justificatif (memoire, prive)

const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/tiff'];

/** Justificatif facultatif du constat manuel : 10 Mo, PDF ou image, garde en memoire puis ecrit hors du dossier public. */
export const paymentProofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && PROOF_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new BadRequestError('Justificatif : PDF, JPEG, PNG ou TIFF uniquement.'));
  }
});

// ------------------------------------------------------------------ super-admin

const updateItemSchema = z
  .object({
    discountPercent: z.number().min(0).max(100).optional(),
    unitMonthlyPrice: z.number().nonnegative().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    reason: z.string().trim().max(500).optional()
  })
  .strict();

/** PATCH /api/admin/tenants/:tenantId/subscription/items/:itemId — remise ou prix fige (audit). */
export const updateItemHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(updateItemSchema, req.body);
  const data = await updateSubscriptionItem(req.params.tenantId, req.params.itemId, input, actor(req));
  res.json({ success: true, data });
});

/** GET /api/admin/subscriptions/summaries?tenantIds=a,b,c — resume par agence (liste des agences). */
export const summariesHandler = asyncHandler(async (req: Request, res: Response) => {
  const raw = typeof req.query.tenantIds === 'string' ? req.query.tenantIds : '';
  const ids = raw
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
  if (ids.length > MAX_SUMMARY_TENANTS) {
    throw new BadRequestError('Trop d’agences demandées en une fois.');
  }
  const data = await listSubscriptionSummaries(ids);
  res.json({ success: true, data });
});

/** GET /api/admin/tenants/:tenantId/subscription/extension-requests */
export const adminListExtensionRequestsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listExtensionRequests(req.params.tenantId);
  res.json({ success: true, data });
});

const handleRequestSchema = z.object({
  status: z.enum(['HANDLED', 'DECLINED']),
  note: z.string().trim().max(1000).nullable().optional()
});

/** PATCH /api/admin/tenants/:tenantId/subscription/extension-requests/:requestId */
export const handleExtensionRequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(handleRequestSchema, req.body);
  const data = await handleExtensionRequest(req.params.tenantId, req.params.requestId, input, actor(req));
  res.json({ success: true, data });
});

const manualPaymentSchema = z.object({
  method: z.enum([
    PlatformPaymentMethod.BANK_TRANSFER,
    PlatformPaymentMethod.MOBILE_MONEY,
    PlatformPaymentMethod.CHECK,
    PlatformPaymentMethod.CASH
  ]),
  paidAt: z
    .string()
    .min(1)
    .refine(value => !Number.isNaN(new Date(value).getTime()), { message: 'Date invalide' })
    .transform(value => new Date(value)),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional()
});

/**
 * POST /api/admin/tenants/:tenantId/platform-invoices/:invoiceId/payment (multipart :
 * method, paidAt, reference?, note?, proof?) — constat manuel ; 409 si deja reglee.
 */
export const recordManualPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(manualPaymentSchema, req.body ?? {});
  const file = req.file;
  const data = await recordManualPayment(
    req.params.tenantId,
    req.params.invoiceId,
    {
      ...input,
      proof: file ? { buffer: file.buffer, originalName: file.originalname, mimeType: file.mimetype } : null
    },
    actor(req)
  );
  res.status(201).json({ success: true, data });
});

/** GET /api/admin/tenants/:tenantId/platform-invoices/:invoiceId/payment — reglement et tentatives en ligne. */
export const adminGetInvoicePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const [payment, checkouts] = await Promise.all([
    getInvoicePayment(req.params.tenantId, req.params.invoiceId),
    listInvoiceCheckouts(req.params.tenantId, req.params.invoiceId)
  ]);
  res.json({ success: true, data: { payment, checkouts } });
});

/** GET /api/admin/tenants/:tenantId/platform-invoices/:invoiceId/payment/proof — justificatif prive. */
export const downloadPaymentProofHandler = asyncHandler(async (req: Request, res: Response) => {
  const proof = await getInvoicePaymentProof(req.params.tenantId, req.params.invoiceId);
  res.setHeader('Content-Type', proof.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(proof.name)}"`);
  res.sendFile(proof.absolutePath);
});

// ------------------------------------------------------------------ agence (/api/tenants/:tenantId/subscription)

/** GET …/subscription/payment-availability → { available, mode } */
export const paymentAvailabilityHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: getPlatformPaymentAvailability() });
});

/** POST …/subscription/invoices/:invoiceId/checkout → 201 PlatformCheckout ; 409 avec reprise. */
export const startCheckoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await startInvoiceCheckout(req.params.tenantId, req.params.invoiceId, actor(req));
  res.status(201).json({ success: true, data });
});

/** GET …/subscription/checkouts/:codePaiement — suivi du retour de paiement. */
export const getCheckoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getInvoiceCheckoutForTenant(req.params.tenantId, req.params.codePaiement);
  res.json({ success: true, data });
});

/** GET …/subscription/invoices/:invoiceId/payment — reglement de la facture, vu par l'agence. */
export const tenantGetInvoicePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getInvoicePayment(req.params.tenantId, req.params.invoiceId);
  res.json({ success: true, data });
});

const extensionRequestSchema = z.object({
  catalogCode: z.string().trim().min(1).max(40).nullable().optional(),
  quantity: z.number().int().min(1).max(1000).nullable().optional(),
  message: z.string().trim().min(3).max(2000)
});

/** POST …/subscription/extension-requests → 201 */
export const createExtensionRequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parse(extensionRequestSchema, req.body);
  const data = await createExtensionRequest(req.params.tenantId, input, actor(req));
  res.status(201).json({ success: true, data });
});

/** GET …/subscription/extension-requests */
export const tenantListExtensionRequestsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listExtensionRequests(req.params.tenantId);
  res.json({ success: true, data });
});
