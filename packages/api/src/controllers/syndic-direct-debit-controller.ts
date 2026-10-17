import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { sendPrivateFile } from '../lib/files/private-files';
import { generateAuthorizationPdf } from '../lib/direct-debit/authorization-pdf';
import {
  activateMandate,
  checkIban,
  getMandate,
  getSignedScanFile,
  reactivateMandate,
  revokeMandate,
  suspendMandate,
  updateMandate,
  uploadSignedScan
} from '../lib/direct-debit/mandates';
import {
  cancelRemittance,
  cancelRemittanceLine,
  exportRemittance,
  getRemittance,
  listRemittances,
  refreshRemittance,
  resendPrenotifications,
  submitRemittance,
  validateRemittance
} from '../lib/direct-debit/remittances';
import { cancelLineSchema, cancelRemittanceSchema } from '../lib/direct-debit/remittance-schemas';
import {
  applyReturnFile,
  listReturnImports,
  previewReturnFile,
  rejectRemittanceLine,
  settleAllRemittanceLines,
  settleRemittanceLine
} from '../lib/direct-debit/returns';
import {
  listReturnImportsQuerySchema,
  rejectLineSchema,
  returnFormatSchema,
  settleAllSchema,
  settleLineSchema
} from '../lib/direct-debit/returns/schemas';
import {
  activateSyndicMandateSchema,
  createSyndicMandateSchema,
  ibanCheckSchema,
  listSyndicMandatesQuerySchema,
  revokeMandateSchema,
  suspendMandateSchema,
  updateMandateSchema,
  upsertSyndicCreditorSchema
} from '../lib/direct-debit/schemas';
import { getSyndicCreditor, upsertSyndicCreditor } from '../lib/direct-debit/syndic/creditors';
import { createSyndicMandate, listLotDebtors, listSyndicMandates } from '../lib/direct-debit/syndic/mandates';
import { createSyndicRemittance } from '../lib/direct-debit/syndic/remittances';
import { createSyndicRemittanceSchema, listSyndicRemittancesQuerySchema } from '../lib/direct-debit/syndic/schemas';
import { syndicCtx } from '../lib/direct-debit/syndic/scope';

/**
 * Prélèvement bancaire des copropriétés : créancier du syndicat, mandats par
 * lot, remises et retours banque (spec 042, lot P4, data-model §9.4).
 * Contrôleurs fins ; la logique métier vit dans `lib/direct-debit/`. Les gardes
 * (session, agence, syndicat de l'agence, permission) sont posées par
 * `routes/syndic-direct-debit-routes.ts`. Les erreurs typées remontent au
 * gestionnaire central (`asyncHandler`).
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

const syndicOf = (req: Request) => idParam(req, 'syndicId', t('Copropriété introuvable ou inaccessible.'));
const lotOf = (req: Request) => idParam(req, 'lotId', t('Lot introuvable ou inaccessible pour cette copropriété.'));
const mandateOf = (req: Request) => idParam(req, 'mandateId', t('Mandat introuvable.'));
const remittanceOf = (req: Request) => idParam(req, 'remittanceId', t('Remise introuvable.'));
const lineOf = (req: Request) => idParam(req, 'lineId', t('Ligne de remise introuvable.'));
const actorOf = (req: Request) => req.user?.userId;
/** Périmètre de la route : les objets d'un autre syndicat ou du locatif sont introuvables. */
const ctxOf = (req: Request) => syndicCtx(syndicOf(req));

// --- Créancier du syndicat --------------------------------------------------

export const getCreditorHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getSyndicCreditor(tenantOf(req), syndicOf(req)) });
});

export const upsertCreditorHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = upsertSyndicCreditorSchema.parse(req.body ?? {});
  const data = await upsertSyndicCreditor(tenantOf(req), syndicOf(req), input, actorOf(req));
  res.json({ success: true, data });
});

// --- IBAN et débiteurs ------------------------------------------------------

export const checkIbanHandler = asyncHandler(async (req: Request, res: Response) => {
  const { iban } = ibanCheckSchema.parse(req.body ?? {});
  res.json({ success: true, data: checkIban(iban) });
});

export const listLotDebtorsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await listLotDebtors(tenantOf(req), syndicOf(req), lotOf(req)) });
});

// --- Mandats ---------------------------------------------------------------

export const listMandatesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listSyndicMandatesQuerySchema.parse(req.query ?? {});
  res.json({ success: true, data: await listSyndicMandates(tenantOf(req), syndicOf(req), query) });
});

export const createMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSyndicMandateSchema.parse(req.body ?? {});
  const data = await createSyndicMandate(tenantOf(req), syndicOf(req), input, actorOf(req));
  res.status(201).json({ success: true, data });
});

export const getMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getMandate(tenantOf(req), mandateOf(req), ctxOf(req)) });
});

export const updateMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateMandateSchema.parse(req.body ?? {});
  const data = await updateMandate(tenantOf(req), mandateOf(req), input, actorOf(req), ctxOf(req));
  res.json({ success: true, data });
});

export const activateMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = activateSyndicMandateSchema.parse(req.body ?? {});
  const data = await activateMandate(tenantOf(req), mandateOf(req), input, actorOf(req), ctxOf(req));
  res.json({ success: true, data });
});

export const suspendMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = suspendMandateSchema.parse(req.body ?? {});
  const data = await suspendMandate(tenantOf(req), mandateOf(req), input, actorOf(req), ctxOf(req));
  res.json({ success: true, data });
});

export const reactivateMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await reactivateMandate(tenantOf(req), mandateOf(req), actorOf(req), ctxOf(req));
  res.json({ success: true, data });
});

export const revokeMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = revokeMandateSchema.parse(req.body ?? {});
  const data = await revokeMandate(tenantOf(req), mandateOf(req), input, actorOf(req), ctxOf(req));
  res.json({ success: true, data });
});

// --- Documents du mandat ----------------------------------------------------

export const downloadAuthorizationPdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const { buffer, fileName } = await generateAuthorizationPdf(tenantOf(req), mandateOf(req), actorOf(req), ctxOf(req));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Content-Length', buffer.length.toString());
  // Le document porte l'IBAN complet : ni cache navigateur ni cache intermédiaire.
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
});

export const uploadSignedScanHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await uploadSignedScan(tenantOf(req), mandateOf(req), req.file, actorOf(req), ctxOf(req));
  res.json({ success: true, data });
});

export const downloadSignedScanHandler = asyncHandler(async (req: Request, res: Response) => {
  const file = await getSignedScanFile(tenantOf(req), mandateOf(req), ctxOf(req));
  sendPrivateFile(res, file);
});

// --- Remises ----------------------------------------------------------------

export const listRemittancesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listSyndicRemittancesQuerySchema.parse(req.query ?? {});
  res.json({ success: true, data: await listRemittances(tenantOf(req), query, ctxOf(req)) });
});

export const createRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSyndicRemittanceSchema.parse(req.body ?? {});
  const data = await createSyndicRemittance(tenantOf(req), syndicOf(req), input, actorOf(req));
  res.status(201).json({ success: true, data });
});

export const getRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getRemittance(tenantOf(req), remittanceOf(req), ctxOf(req)) });
});

export const refreshRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await refreshRemittance(tenantOf(req), remittanceOf(req), actorOf(req), ctxOf(req));
  res.json({ success: true, data });
});

export const cancelRemittanceLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = cancelLineSchema.parse(req.body ?? {});
  const data = await cancelRemittanceLine(
    tenantOf(req),
    remittanceOf(req),
    lineOf(req),
    input.reason,
    actorOf(req),
    ctxOf(req)
  );
  res.json({ success: true, data });
});

export const validateRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await validateRemittance(tenantOf(req), remittanceOf(req), actorOf(req), undefined, ctxOf(req));
  res.json({ success: true, data });
});

export const resendPrenotificationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await resendPrenotifications(tenantOf(req), remittanceOf(req), actorOf(req), undefined, ctxOf(req));
  res.json({ success: true, data });
});

export const exportRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const file = await exportRemittance(tenantOf(req), remittanceOf(req), actorOf(req), undefined, ctxOf(req));
  res.setHeader('Content-Type', file.contentType);
  // Nom fabriqué par le serveur (PRL-AAAA-NNNN.csv) : ASCII, mais assaini par principe.
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
  res.setHeader('Content-Length', file.buffer.length.toString());
  // Le fichier porte les IBAN complets : ni cache navigateur ni cache intermédiaire.
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);
});

export const submitRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await submitRemittance(tenantOf(req), remittanceOf(req), actorOf(req), undefined, ctxOf(req));
  res.json({ success: true, data });
});

export const cancelRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = cancelRemittanceSchema.parse(req.body ?? {});
  const data = await cancelRemittance(
    tenantOf(req),
    remittanceOf(req),
    input.reason,
    actorOf(req),
    undefined,
    ctxOf(req)
  );
  res.json({ success: true, data });
});

// --- Constats et retours banque (service de retour, lot P3) -----------------

const userOf = (req: Request): string | null => req.user?.userId ?? null;

export const settleLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = settleLineSchema.parse(req.body ?? {});
  const data = await settleRemittanceLine(
    tenantOf(req),
    ctxOf(req),
    remittanceOf(req),
    lineOf(req),
    input,
    userOf(req)
  );
  res.json({ success: true, data });
});

export const rejectLineHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = rejectLineSchema.parse(req.body ?? {});
  const data = await rejectRemittanceLine(
    tenantOf(req),
    ctxOf(req),
    remittanceOf(req),
    lineOf(req),
    input,
    userOf(req)
  );
  res.json({ success: true, data });
});

export const settleAllHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = settleAllSchema.parse(req.body ?? {});
  const data = await settleAllRemittanceLines(tenantOf(req), ctxOf(req), remittanceOf(req), input, userOf(req));
  res.json({ success: true, data });
});

export const previewReturnHandler = asyncHandler(async (req: Request, res: Response) => {
  const format = returnFormatSchema.parse((req.body as { format?: unknown } | undefined)?.format || undefined);
  res.json({ success: true, data: await previewReturnFile(tenantOf(req), ctxOf(req), req.file, format) });
});

export const applyReturnHandler = asyncHandler(async (req: Request, res: Response) => {
  const format = returnFormatSchema.parse((req.body as { format?: unknown } | undefined)?.format || undefined);
  const data = await applyReturnFile(tenantOf(req), ctxOf(req), req.file, format, userOf(req));
  res.json({ success: true, data });
});

export const listReturnsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listReturnImportsQuerySchema.parse(req.query ?? {});
  res.json({ success: true, data: await listReturnImports(tenantOf(req), ctxOf(req), query) });
});
