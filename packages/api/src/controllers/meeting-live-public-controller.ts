import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-middleware';
import { invalidSecureLinkError } from '../lib/secure-links';
import { castPublicVotes, getPublicLiveState, joinPublicMeeting } from '../lib/syndics/meeting-live-public';
import { publicHandSchema, publicTokenSchema, publicVoteSchema } from '../lib/syndics/meeting-live-schemas';
import { issuePublicVisioToken, setPublicHandRaised } from '../lib/syndics/meeting-visio';

/**
 * Points d'entree publics de l'AG en direct (spec 043). Le jeton est dans le
 * CORPS d'un POST, jamais dans l'URL. Un corps invalide recoit la meme 404
 * qu'un jeton inconnu : aucun indice distinctif. Seuls les champs du schema
 * sont lus (agence, contact, lot hors perimetre envoyes en plus sont ignores).
 */

export const meetingLiveStateHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = publicTokenSchema.safeParse(req.body);
  if (!parsed.success) throw invalidSecureLinkError();
  const data = await getPublicLiveState(parsed.data.token);
  res.status(200).json({ success: true, data });
});

export const meetingLiveJoinHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = publicTokenSchema.safeParse(req.body);
  if (!parsed.success) throw invalidSecureLinkError();
  const data = await joinPublicMeeting(parsed.data.token);
  res.status(200).json({ success: true, data });
});

export const meetingLiveVoteHandler = asyncHandler(async (req: Request, res: Response) => {
  // Jeton absent ou mal forme : 404 uniforme ; reste du corps invalide : 400 avec le detail des champs.
  const token = publicTokenSchema.safeParse(req.body);
  if (!token.success) throw invalidSecureLinkError();
  const parsed = publicVoteSchema.parse(req.body);
  const data = await castPublicVotes(parsed.token, { resolutionId: parsed.resolutionId, votes: parsed.votes });
  res.status(200).json({ success: true, data });
});

/** Spec 045 : jeton de la salle de visio (le jeton du lien est dans le corps, jamais dans l'URL). */
export const meetingVisioTokenHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = publicTokenSchema.safeParse(req.body);
  if (!parsed.success) throw invalidSecureLinkError();
  const data = await issuePublicVisioToken(parsed.data.token);
  res.status(200).json({ success: true, data });
});

/** Spec 045 : lever ou baisser la main dans la salle. */
export const meetingVisioHandHandler = asyncHandler(async (req: Request, res: Response) => {
  // Jeton absent ou mal forme : 404 uniforme ; `raised` invalide : 400.
  const token = publicTokenSchema.safeParse(req.body);
  if (!token.success) throw invalidSecureLinkError();
  const parsed = publicHandSchema.parse(req.body);
  const data = await setPublicHandRaised(parsed.token, parsed.raised);
  res.status(200).json({ success: true, data });
});
