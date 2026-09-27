import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { sendPrivateFile } from '../lib/files/private-files';
import {
  attachProviderInvoiceFile,
  cancelProviderInvoice,
  cancelProviderPayment,
  createProviderInvoice,
  getProviderInvoice,
  getProviderInvoiceFile,
  listFundMovements,
  listProviderBalances,
  listProviderInvoices,
  payProviderInvoice,
  removeProviderInvoiceAttachment,
  updateProviderInvoice
} from '../lib/syndics/provider-invoices';
import {
  cancelSchema,
  createProviderInvoiceSchema,
  createProviderPaymentSchema,
  fundMovementsQuerySchema,
  listProviderInvoicesQuerySchema,
  updateProviderInvoiceSchema
} from '../lib/syndics/provider-invoice-schemas';

/**
 * Factures et paiements des prestataires d'une copropriete (lot S6).
 * Logique metier : lib/syndics/provider-invoices.ts.
 */

const uuid = z.string().uuid();

function tenantOf(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('TenantId manquant');
  return tenantId;
}

/** Un identifiant qui n'est pas un UUID ne designe rien : 404, pas 500. */
function idParam(req: Request, name: string, message: string): string {
  const parsed = uuid.safeParse(req.params[name]);
  if (!parsed.success) throw new NotFoundError(message);
  return parsed.data;
}

const syndicOf = (req: Request) => idParam(req, 'syndicId', 'Copropriete introuvable ou inaccessible');
const invoiceOf = (req: Request) => idParam(req, 'invoiceId', 'Facture de prestataire introuvable.');

export const listProviderInvoicesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listProviderInvoicesQuerySchema.parse(req.query ?? {});
  const data = await listProviderInvoices(tenantOf(req), syndicOf(req), query);
  res.json({ success: true, data });
});

export const createProviderInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createProviderInvoiceSchema.parse(req.body ?? {});
  const data = await createProviderInvoice(tenantOf(req), syndicOf(req), input, req.user?.userId, req.file);
  res.status(201).json({ success: true, data });
});

export const getProviderInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getProviderInvoice(tenantOf(req), syndicOf(req), invoiceOf(req));
  res.json({ success: true, data });
});

export const updateProviderInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateProviderInvoiceSchema.parse(req.body ?? {});
  const data = await updateProviderInvoice(tenantOf(req), syndicOf(req), invoiceOf(req), input);
  res.json({ success: true, data });
});

export const cancelProviderInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = cancelSchema.parse(req.body ?? {});
  const data = await cancelProviderInvoice(tenantOf(req), syndicOf(req), invoiceOf(req), input, req.user?.userId);
  res.json({ success: true, data });
});

export const payProviderInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createProviderPaymentSchema.parse(req.body ?? {});
  const data = await payProviderInvoice(tenantOf(req), syndicOf(req), invoiceOf(req), input, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const cancelProviderPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = cancelSchema.parse(req.body ?? {});
  const paymentId = idParam(req, 'paymentId', 'Paiement introuvable.');
  const data = await cancelProviderPayment(
    tenantOf(req),
    syndicOf(req),
    invoiceOf(req),
    paymentId,
    input,
    req.user?.userId
  );
  res.json({ success: true, data });
});

export const uploadProviderInvoiceFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await attachProviderInvoiceFile(
    tenantOf(req),
    syndicOf(req),
    invoiceOf(req),
    req.file,
    req.user?.userId
  );
  res.json({ success: true, data });
});

export const deleteProviderInvoiceFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await removeProviderInvoiceAttachment(tenantOf(req), syndicOf(req), invoiceOf(req), req.user?.userId);
  res.json({ success: true, data });
});

export const downloadProviderInvoiceFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const notFound = 'Piece jointe introuvable.';
  const file = await getProviderInvoiceFile(
    tenantOf(req),
    idParam(req, 'syndicId', notFound),
    idParam(req, 'invoiceId', notFound)
  );
  sendPrivateFile(res, file);
});

export const listProviderBalancesHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listProviderBalances(tenantOf(req), syndicOf(req));
  res.json({ success: true, data });
});

export const listFundMovementsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = fundMovementsQuerySchema.parse(req.query ?? {});
  const fundId = idParam(req, 'fundId', 'Fonds introuvable ou inaccessible pour cette copropriete');
  const data = await listFundMovements(tenantOf(req), syndicOf(req), fundId, query);
  res.json({ success: true, data });
});
