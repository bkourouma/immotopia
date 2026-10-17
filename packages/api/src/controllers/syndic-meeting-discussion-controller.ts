import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-middleware';
import { badRequest } from '../lib/errors';
import {
  getManagerDiscussion,
  sendManagerDiscussionMessage,
  setDiscussionMessageHidden,
  setDiscussionOpen,
  setParticipantWriting
} from '../lib/syndics/meeting-discussion';
import {
  discussionHideSchema,
  discussionSendSchema,
  discussionStateSchema,
  discussionWriteSchema
} from '../lib/syndics/meeting-live-schemas';

/**
 * Discussion ecrite moderee de la visio, cote gestionnaire (spec 046). Prefixe
 * `/tenants/:tenantId/syndics/:syndicId/assemblees/:meetingId/visio`, permissions SYNDIC_VIEW (lecture)
 * et SYNDIC_EDIT (ecriture, moderation) posees par le routeur. Reponses `no-store`.
 */

function scopeOf(req: Request) {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw badRequest("TenantId manquant pour la discussion de l'assemblée");
  return {
    tenantId,
    syndicateId: req.params.syndicId,
    meetingId: req.params.meetingId,
    actorUserId: req.user?.userId ?? null
  };
}

const uuidParamSchema = z.string().uuid();

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

export const getMeetingDiscussionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId } = scopeOf(req);
  const data = await getManagerDiscussion(tenantId, syndicateId, meetingId);
  noStore(res);
  res.json({ success: true, data });
});

export const sendMeetingDiscussionMessageHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  if (!actorUserId) throw badRequest('Utilisateur manquant pour la discussion');
  const body = discussionSendSchema.parse(req.body ?? {});
  const data = await sendManagerDiscussionMessage(tenantId, syndicateId, meetingId, actorUserId, body.body);
  noStore(res);
  res.json({ success: true, data });
});

export const setMeetingDiscussionMessageHiddenHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const messageId = uuidParamSchema.parse(req.params.messageId);
  const body = discussionHideSchema.parse(req.body ?? {});
  const data = await setDiscussionMessageHidden(tenantId, syndicateId, meetingId, messageId, body.hidden, actorUserId);
  noStore(res);
  res.json({ success: true, data });
});

export const setMeetingDiscussionOpenHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const body = discussionStateSchema.parse(req.body ?? {});
  const data = await setDiscussionOpen(tenantId, syndicateId, meetingId, body.open, actorUserId);
  noStore(res);
  res.json({ success: true, data });
});

export const setParticipantWritingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const participantId = uuidParamSchema.parse(req.params.participantId);
  const body = discussionWriteSchema.parse(req.body ?? {});
  const data = await setParticipantWriting(tenantId, syndicateId, meetingId, participantId, body.allowed, actorUserId);
  noStore(res);
  res.json({ success: true, data });
});
