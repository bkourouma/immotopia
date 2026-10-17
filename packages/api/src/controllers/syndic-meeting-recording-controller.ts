import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { badRequest } from '../lib/errors';
import {
  auditRecordingAccess,
  deleteRecording,
  getRecordingFile,
  listRecordings,
  retryRecording,
  startRecording,
  stopRecording,
  type RecordingFile
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

export const retryRecordingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId } = scopeOf(req);
  const recordingId = recordingParamSchema.parse(req.params.recordingId);
  const data = await retryRecording(tenantId, syndicateId, meetingId, recordingId);
  noStore(res);
  res.json({ success: true, data });
});

/**
 * Le debut de la video (pas de `Range`, ou `Range` qui commence a 0) et tout telechargement sont audites ;
 * les requetes suivantes du lecteur (avance rapide, lecture par morceaux) ne le sont pas.
 */
function isStartOfPlayback(rangeHeader: string | undefined): boolean {
  if (!rangeHeader) return true;
  const match = /^bytes=(\d*)-/.exec(rangeHeader.trim());
  return match !== null && match[1] !== '' && Number(match[1]) === 0;
}

/**
 * `sendFile` avec `root` (le dossier du fichier) et un nom relatif : le refus des fichiers caches
 * (`dotfiles: 'deny'`) ne regarde alors que la partie relative, et non un dossier parent comme
 * `.claude/worktrees/...`. Erreurs sans chemin disque : absent = 404, lecture abandonnee ignoree.
 */
function sendRecording(res: Response, file: RecordingFile, disposition: 'inline' | 'attachment'): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    res.sendFile(
      file.fileName,
      {
        root: file.directory,
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
      error => {
        if (!error) return resolve();
        const code = (error as NodeJS.ErrnoException).code;
        // Lecteur video qui abandonne (changement de position, onglet ferme) : normal.
        if (code === 'ECONNABORTED' || res.headersSent) return resolve();
        if (code === 'ENOENT' || code === 'ENOTDIR') {
          return reject(new NotFoundError(t('Enregistrement introuvable ou inaccessible')));
        }
        // Jamais le message brut : il contient un chemin disque.
        return reject(new Error('Recording file could not be read'));
      }
    );
  });
}

/** Lecture (flux avec `Range`) ou telechargement (`?telecharger=1`). */
export const streamRecordingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, syndicateId, meetingId, actorUserId } = scopeOf(req);
  const recordingId = recordingParamSchema.parse(req.params.recordingId);
  const query = downloadQuerySchema.parse(req.query);
  const file = await getRecordingFile(tenantId, syndicateId, meetingId, recordingId);
  const download = query.telecharger === '1';
  if (download || isStartOfPlayback(req.headers.range)) {
    auditRecordingAccess(file, actorUserId, download ? 'DOWNLOAD' : 'STREAM');
  }
  await sendRecording(res, file, download ? 'attachment' : 'inline');
});
