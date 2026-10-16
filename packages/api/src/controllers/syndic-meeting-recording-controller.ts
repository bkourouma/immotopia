import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-middleware';
import { badRequest } from '../lib/errors';
import {
  deleteRecording,
  getRecordingFile,
  listRecordings,
  startRecording,
  stopRecording
} from '../lib/syndics/meeting-recording';

/**
 * Enregistrement des AG en visio, cote gestionnaire (spec 045, R1 et R6).
 * Prefixe `/tenants/:tenantId/syndics/:syndicId/assemblees/:meetingId`,
 * permissions SYNDIC_VIEW (lecture) et SYNDIC_EDIT (ecriture) posees par le
 * routeur. Le fichier ne sort que par `/enregistrements/:id/fichier`.
 */

function scopeOf(req: Request) {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw badRequest("TenantId manquant pour l'enregistrement de l'assemblée");
  return {
    tenantId,
    syndicateId: req.params.syndicId,
    meetingId: req.params.meetingId,
    actorUserId: req.user?.userId ?? null
  };
}

const recordingParamSchema = z.string().uuid();
const downloadQuerySchema = z.object({ telecharger: z.enum(['0', '1']).optional() });

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

export const startRecordingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const data = await startRecording(tenantId, syndicateId, meetingId, actorUserId);
  noStore(res);
  res.json({ success: true, data });
});

export const stopRecordingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const data = await stopRecording(tenantId, syndicateId, meetingId, actorUserId);
  noStore(res);
  res.json({ success: true, data });
});

export const listRecordingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId } = scopeOf(req);
  const data = await listRecordings(tenantId, syndicateId, meetingId);
  noStore(res);
  res.json({ success: true, data });
});

export const deleteRecordingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const recordingId = recordingParamSchema.parse(req.params.recordingId);
  const data = await deleteRecording(tenantId, syndicateId, meetingId, recordingId, actorUserId);
  noStore(res);
  res.json({ success: true, data });
});

/**
 * Lecture (flux avec `Range`) ou telechargement (`?telecharger=1`). `sendFile` gere
 * `Range`, `HEAD` et `If-Range` ; nom de fichier neutre, jamais d'identifiant.
 */
export const streamRecordingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId } = scopeOf(req);
  const recordingId = recordingParamSchema.parse(req.params.recordingId);
  const query = downloadQuerySchema.parse(req.query);
  const file = await getRecordingFile(tenantId, syndicateId, meetingId, recordingId);
  const disposition = query.telecharger === '1' ? 'attachment' : 'inline';
  await new Promise<void>((resolve, reject) => {
    res.sendFile(
      file.absolutePath,
      {
        dotfiles: 'deny',
        cacheControl: false,
        lastModified: false,
        etag: false,
        headers: {
          'Content-Type': 'video/mp4',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': `${disposition}; filename="${file.downloadName}"`
        }
      },
      error => (error ? reject(error) : resolve())
    );
  });
});
