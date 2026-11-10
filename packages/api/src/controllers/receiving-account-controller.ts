import type { Request, Response } from 'express';
import { z } from 'zod';
import { t } from '../i18n';
import { asyncHandler, BadRequestError, ForbiddenError } from '../middleware/error-middleware';
import { assertUuidOrNotFound } from '../lib/documents/mandating-agencies';
import { sendPrivateFile } from '../lib/files/private-files';
import {
  listCoOwnerPortalReceivingAccounts,
  listTenantPortalReceivingAccounts,
  readCoOwnerPortalReceivingAccountQr,
  readTenantPortalReceivingAccountQr
} from '../lib/receiving-accounts/portal';
import { createReceivingAccountBodySchema, updateReceivingAccountBodySchema } from '../lib/receiving-accounts/schemas';
import {
  createReceivingAccount,
  deleteReceivingAccount,
  listReceivingAccounts,
  readReceivingAccountQr,
  updateReceivingAccount
} from '../lib/receiving-accounts/service';
import type { ReceivingAccountTarget } from '../lib/receiving-accounts/types';

/**
 * Comptes de réception (spec 048, lot Q) : agence, copropriété, portails.
 *
 * Les gardes (session, agence, permission ou portail) sont posées par les
 * routeurs. L'agence vient du contexte posé par la garde, jamais d'un corps ;
 * la copropriété de l'URL est vérifiée contre l'agence par le service (404).
 * L'image n'est jamais servie en statique : `sendPrivateFile` en `inline`.
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) throw new ForbiddenError(t('Contexte d’agence manquant.'));
  return tenantId;
}

function actorOf(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) throw new BadRequestError(t('Utilisateur manquant dans la requête.'));
  return userId;
}

const accountIdOf = (req: Request) => assertUuidOrNotFound(req.params.accountId, t('Compte de réception introuvable.'));

const AGENCY: ReceivingAccountTarget = { scope: 'AGENCY', syndicateId: null };

function syndicTargetOf(req: Request): ReceivingAccountTarget {
  const syndicateId = assertUuidOrNotFound(req.params.syndicId, t('Copropriété introuvable ou inaccessible.'));
  return { scope: 'SYNDICATE', syndicateId };
}

type TargetOf = (req: Request) => ReceivingAccountTarget;

/** Les cinq handlers de gestion, identiques pour l'agence et la copropriété. */
function adminHandlers(targetOf: TargetOf) {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      res.json({ success: true, data: await listReceivingAccounts(tenantIdOf(req), targetOf(req)) });
    }),
    create: asyncHandler(async (req: Request, res: Response) => {
      const body = createReceivingAccountBodySchema.parse(req.body ?? {});
      const data = await createReceivingAccount({
        tenantId: tenantIdOf(req),
        target: targetOf(req),
        actorUserId: actorOf(req),
        body,
        file: req.file
      });
      res.status(201).json({ success: true, data });
    }),
    update: asyncHandler(async (req: Request, res: Response) => {
      const body = updateReceivingAccountBodySchema.parse(req.body ?? {});
      const data = await updateReceivingAccount({
        tenantId: tenantIdOf(req),
        target: targetOf(req),
        actorUserId: actorOf(req),
        accountId: accountIdOf(req),
        body,
        file: req.file
      });
      res.json({ success: true, data });
    }),
    remove: asyncHandler(async (req: Request, res: Response) => {
      await deleteReceivingAccount({
        tenantId: tenantIdOf(req),
        target: targetOf(req),
        actorUserId: actorOf(req),
        accountId: accountIdOf(req)
      });
      res.json({ success: true, data: { deleted: true } });
    }),
    qr: asyncHandler(async (req: Request, res: Response) => {
      const file = await readReceivingAccountQr(tenantIdOf(req), targetOf(req), accountIdOf(req));
      sendPrivateFile(res, file, { inline: true });
    })
  };
}

const agency = adminHandlers(() => AGENCY);
export const listAgencyReceivingAccountsHandler = agency.list;
export const createAgencyReceivingAccountHandler = agency.create;
export const updateAgencyReceivingAccountHandler = agency.update;
export const deleteAgencyReceivingAccountHandler = agency.remove;
export const readAgencyReceivingAccountQrHandler = agency.qr;

const syndic = adminHandlers(syndicTargetOf);
export const listSyndicReceivingAccountsHandler = syndic.list;
export const createSyndicReceivingAccountHandler = syndic.create;
export const updateSyndicReceivingAccountHandler = syndic.update;
export const deleteSyndicReceivingAccountHandler = syndic.remove;
export const readSyndicReceivingAccountQrHandler = syndic.qr;

// --- Portails ----------------------------------------------------------------

function tenantPortalTenantId(req: Request): string {
  if (!req.tenantPortal) throw new ForbiddenError('Accès portail locataire requis.');
  return req.tenantPortal.tenantId;
}

function coOwnerScope(req: Request) {
  if (!req.coOwnerPortal) throw new ForbiddenError('Accès portail copropriétaire refusé.');
  return req.coOwnerPortal.scope;
}

const coOwnerQuerySchema = z.object({ syndicId: z.string().uuid().optional() }).strict();

export const listTenantPortalReceivingAccountsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await listTenantPortalReceivingAccounts(tenantPortalTenantId(req)) });
});

export const readTenantPortalReceivingAccountQrHandler = asyncHandler(async (req: Request, res: Response) => {
  const file = await readTenantPortalReceivingAccountQr(tenantPortalTenantId(req), accountIdOf(req));
  sendPrivateFile(res, file, { inline: true });
});

export const listCoOwnerPortalReceivingAccountsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { syndicId } = coOwnerQuerySchema.parse(req.query);
  const scope = coOwnerScope(req);
  res.json({
    success: true,
    data: await listCoOwnerPortalReceivingAccounts(scope.tenantId, scope.syndicateIds, syndicId)
  });
});

export const readCoOwnerPortalReceivingAccountQrHandler = asyncHandler(async (req: Request, res: Response) => {
  const scope = coOwnerScope(req);
  const file = await readCoOwnerPortalReceivingAccountQr(scope.tenantId, scope.syndicateIds, accountIdOf(req));
  sendPrivateFile(res, file, { inline: true });
});
