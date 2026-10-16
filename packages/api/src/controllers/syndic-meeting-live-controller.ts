import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-middleware';
import { badRequest } from '../lib/errors';
import {
  closeResolutionVote,
  getLiveAdminView,
  openResolutionVote,
  setLotAttendances
} from '../lib/syndics/meeting-live';
import {
  issueParticipantLink,
  listMeetingParticipants,
  revokeParticipantLinks
} from '../lib/syndics/meeting-participants';
import { bulkAttendanceSchema, setAttendanceSchema } from '../lib/syndics/meeting-live-schemas';

/**
 * AG en direct, cote gestionnaire (spec 043). Prefixe
 * `/tenants/:tenantId/syndics/:syndicId/assemblees/:meetingId`, permissions
 * SYNDIC_VIEW (lecture) et SYNDIC_EDIT (ecriture) posees par le routeur.
 */

function scopeOf(req: Request) {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw badRequest("TenantId manquant pour l'assemblée en direct");
  return {
    tenantId,
    syndicateId: req.params.syndicId,
    meetingId: req.params.meetingId,
    actorUserId: req.user?.userId ?? null
  };
}

const lotParamSchema = z.string().uuid();
const resolutionParamSchema = z.string().uuid();

export const getLiveMeetingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId } = scopeOf(req);
  const data = await getLiveAdminView(tenantId, syndicateId, meetingId);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data });
});

export const setLotAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const lotId = lotParamSchema.parse(req.params.lotId);
  const body = setAttendanceSchema.parse(req.body);
  const data = await setLotAttendances(tenantId, syndicateId, meetingId, actorUserId, {
    lotIds: [lotId],
    status: body.status,
    mode: body.mode,
    representedByContactId: body.representedByContactId
  });
  res.json({ success: true, data });
});

export const bulkLotAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const body = bulkAttendanceSchema.parse(req.body);
  const data = await setLotAttendances(tenantId, syndicateId, meetingId, actorUserId, body);
  res.json({ success: true, data });
});

export const openResolutionVoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const resolutionId = resolutionParamSchema.parse(req.params.resolutionId);
  const data = await openResolutionVote(tenantId, syndicateId, meetingId, resolutionId, actorUserId);
  res.json({ success: true, data });
});

export const closeResolutionVoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const resolutionId = resolutionParamSchema.parse(req.params.resolutionId);
  const data = await closeResolutionVote(tenantId, syndicateId, meetingId, resolutionId, actorUserId);
  res.json({ success: true, data });
});

export const listMeetingParticipantsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId } = scopeOf(req);
  const data = await listMeetingParticipants(tenantId, syndicateId, meetingId);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data });
});

export const issueParticipantLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const contactId = z.string().min(1).max(100).parse(req.params.contactId);
  const { url, expiresAt } = await issueParticipantLink(tenantId, syndicateId, meetingId, contactId, actorUserId);
  // Le jeton est dans l'URL, remis une seule fois : jamais en cache.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.json({ success: true, data: { url, expiresAt: expiresAt.toISOString() } });
});

export const revokeParticipantLinksHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const contactId = z.string().min(1).max(100).parse(req.params.contactId);
  const data = await revokeParticipantLinks(tenantId, syndicateId, meetingId, contactId, actorUserId);
  res.json({ success: true, data });
});
