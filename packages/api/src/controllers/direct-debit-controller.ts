import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { sendPrivateFile } from '../lib/files/private-files';
import { createCreditor, listCreditors, updateCreditor } from '../lib/direct-debit/creditors';
import {
  activateMandate,
  checkIban,
  createMandate,
  getMandate,
  getSignedScanFile,
  listMandates,
  reactivateMandate,
  revokeMandate,
  suspendMandate,
  updateMandate,
  uploadSignedScan
} from '../lib/direct-debit/mandates';
import { generateAuthorizationPdf } from '../lib/direct-debit/authorization-pdf';
import {
  activateMandateSchema,
  createCreditorSchema,
  createMandateSchema,
  ibanCheckSchema,
  listMandatesQuerySchema,
  revokeMandateSchema,
  suspendMandateSchema,
  updateCreditorSchema,
  updateMandateSchema
} from '../lib/direct-debit/schemas';

/**
 * Prélèvement bancaire : créanciers et mandats (spec 042, lot P1).
 * Contrôleurs fins ; la logique métier vit dans `lib/direct-debit/`. Les
 * erreurs typées remontent au gestionnaire central (`asyncHandler`).
 */

const uuid = z.string().uuid();

function tenantOf(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError(t('TenantId manquant'));
  return tenantId;
}

/** Un identifiant qui n'est pas un UUID ne désigne rien : 404, pas 500. */
function idParam(req: Request, name: string, message: string): string {
  const parsed = uuid.safeParse(req.params[name]);
  if (!parsed.success) throw new NotFoundError(message);
  return parsed.data;
}

const creditorOf = (req: Request) => idParam(req, 'creditorId', t('Créancier introuvable.'));
const mandateOf = (req: Request) => idParam(req, 'mandateId', t('Mandat introuvable.'));
const actorOf = (req: Request) => req.user?.userId;

// --- Créanciers -----------------------------------------------------------

export const listCreditorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listCreditors(tenantOf(req));
  res.json({ success: true, data });
});

export const createCreditorHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createCreditorSchema.parse(req.body ?? {});
  const data = await createCreditor(tenantOf(req), input, actorOf(req));
  res.status(201).json({ success: true, data });
});

export const updateCreditorHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateCreditorSchema.parse(req.body ?? {});
  const data = await updateCreditor(tenantOf(req), creditorOf(req), input, actorOf(req));
  res.json({ success: true, data });
});

// --- IBAN -----------------------------------------------------------------

export const checkIbanHandler = asyncHandler(async (req: Request, res: Response) => {
  const { iban } = ibanCheckSchema.parse(req.body ?? {});
  res.json({ success: true, data: checkIban(iban) });
});

// --- Mandats --------------------------------------------------------------

export const listMandatesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listMandatesQuerySchema.parse(req.query ?? {});
  const data = await listMandates(tenantOf(req), query);
  res.json({ success: true, data });
});

export const createMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createMandateSchema.parse(req.body ?? {});
  const data = await createMandate(tenantOf(req), input, actorOf(req));
  res.status(201).json({ success: true, data });
});

export const getMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getMandate(tenantOf(req), mandateOf(req));
  res.json({ success: true, data });
});

export const updateMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateMandateSchema.parse(req.body ?? {});
  const data = await updateMandate(tenantOf(req), mandateOf(req), input, actorOf(req));
  res.json({ success: true, data });
});

export const activateMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = activateMandateSchema.parse(req.body ?? {});
  const data = await activateMandate(tenantOf(req), mandateOf(req), input, actorOf(req));
  res.json({ success: true, data });
});

export const suspendMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = suspendMandateSchema.parse(req.body ?? {});
  const data = await suspendMandate(tenantOf(req), mandateOf(req), input, actorOf(req));
  res.json({ success: true, data });
});

export const reactivateMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await reactivateMandate(tenantOf(req), mandateOf(req), actorOf(req));
  res.json({ success: true, data });
});

export const revokeMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = revokeMandateSchema.parse(req.body ?? {});
  const data = await revokeMandate(tenantOf(req), mandateOf(req), input, actorOf(req));
  res.json({ success: true, data });
});

// --- Documents ------------------------------------------------------------

export const downloadAuthorizationPdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const { buffer, fileName } = await generateAuthorizationPdf(tenantOf(req), mandateOf(req), actorOf(req));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Content-Length', buffer.length.toString());
  // Le document porte l'IBAN complet : ni cache navigateur ni cache intermédiaire.
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
});

export const uploadSignedScanHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await uploadSignedScan(tenantOf(req), mandateOf(req), req.file, actorOf(req));
  res.json({ success: true, data });
});

export const downloadSignedScanHandler = asyncHandler(async (req: Request, res: Response) => {
  const file = await getSignedScanFile(tenantOf(req), mandateOf(req), undefined, actorOf(req));
  sendPrivateFile(res, file);
});
