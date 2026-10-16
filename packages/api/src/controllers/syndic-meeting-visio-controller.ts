import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-middleware';
import { badRequest } from '../lib/errors';
import {
  getVisioAdminView,
  issueModeratorToken,
  removeVisioParticipant,
  setParticipantSpeaking
} from '../lib/syndics/meeting-visio';
import { visioRemoveSchema, visioSpeakSchema } from '../lib/syndics/meeting-live-schemas';

/**
 * Visio integree a l'AG en direct, cote gestionnaire (spec 045). Prefixe
 * `/tenants/:tenantId/syndics/:syndicId/assemblees/:meetingId/visio`,
 * permissions SYNDIC_VIEW (lecture) et SYNDIC_EDIT (ecriture) posees par le
 * routeur. Reponses `no-store` : le jeton de salle ne se met jamais en cache.
 */

function scopeOf(req: Request) {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw badRequest("TenantId manquant pour la visio de l'assemblée");
  return {
    tenantId,
    syndicateId: req.params.syndicId,
    meetingId: req.params.meetingId,
    actorUserId: req.user?.userId ?? null
  };
}

const participantParamSchema = z.string().uuid();

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

export const getMeetingVisioHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId } = scopeOf(req);
  const data = await getVisioAdminView(tenantId, syndicateId, meetingId);
  noStore(res);
  res.json({ success: true, data });
});

export const issueMeetingVisioTokenHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  if (!actorUserId) throw badRequest('Utilisateur manquant pour la visio');
  const data = await issueModeratorToken(tenantId, syndicateId, meetingId, actorUserId);
  noStore(res);
  res.json({ success: true, data });
});

export const setVisioParticipantSpeakingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const participantId = participantParamSchema.parse(req.params.participantId);
  const body = visioSpeakSchema.parse(req.body ?? {});
  const data = await setParticipantSpeaking(tenantId, syndicateId, meetingId, participantId, body.allowed, actorUserId);
  noStore(res);
  res.json({ success: true, data });
});

export const removeVisioParticipantHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const participantId = participantParamSchema.parse(req.params.participantId);
  const body = visioRemoveSchema.parse(req.body ?? {});
  const data = await removeVisioParticipant(
    tenantId,
    syndicateId,
    meetingId,
    participantId,
    body.revokeLinks ?? false,
    actorUserId
  );
  noStore(res);
  res.json({ success: true, data });
});
