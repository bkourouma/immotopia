import { z } from 'zod';
import { currentLanguage, t } from '../i18n';
import { AppError, asyncHandler, BadRequestError, ForbiddenError } from '../middleware/error-middleware';
import { COPILOT_MAX_MESSAGE_CHARS } from '../lib/ai/contracts';
import { recordTranscriptionUsage } from '../lib/ai/provider-usage';
import { requestTranscription } from '../lib/ai/transcription';
import { getTranscriptionEngine } from '../services/ai-settings-service';

export const MAX_DICTATION_BYTES = 10 * 1024 * 1024;
const multipartAllowance = 64 * 1024;
const languageCode = z.string().regex(/^[a-z]{2}$/);
const fields = z
  .object({
    language: languageCode.optional(),
    durationSeconds: z
      .string()
      .regex(/^\d{1,4}(\.\d{1,3})?$/)
      .transform(Number)
      .pipe(z.number().max(3600))
      .optional()
  })
  .strict();

function audioFormat(bytes: Buffer) {
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm';
  if (bytes.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (bytes.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  return undefined;
}

type Engine = NonNullable<Awaited<ReturnType<typeof getTranscriptionEngine>>>;
type TranscriptionLocals = { transcriptionEngine: Engine; transcriptionDeadline: AbortSignal };

export const requireTranscriptionEngine = asyncHandler(async (req, res, next) => {
  const engine = await getTranscriptionEngine();
  if (!engine) throw new AppError(t('La transcription serveur est indisponible.'), 503);
  if (Number(req.headers['content-length']) > MAX_DICTATION_BYTES + multipartAllowance) {
    throw new AppError(t('Le fichier envoyé dépasse la taille maximale autorisée.'), 413);
  }
  const deadline = AbortSignal.timeout(90_000);
  const stopUpload = () => res.destroy();
  deadline.addEventListener('abort', stopUpload, { once: true });
  const cleanup = () => deadline.removeEventListener('abort', stopUpload);
  res.once('close', cleanup);
  res.locals.transcriptionEngine = engine;
  res.locals.transcriptionDeadline = deadline;
  next();
});

export const transcribeHandler = asyncHandler(async (req, res) => {
  const tenantId = req.tenantContext?.tenantId;
  const userId = req.user?.userId;
  if (!tenantId || !userId) throw new ForbiddenError();
  const { transcriptionEngine: engine, transcriptionDeadline } = res.locals as TranscriptionLocals;
  const file = req.file;
  const format = file && audioFormat(file.buffer);
  if (!file || !format) throw new BadRequestError(t('Le format de cet enregistrement audio est invalide.'));
  const metadata = fields.safeParse(req.body ?? {});
  if (!metadata.success) throw new BadRequestError(t('La langue ou la durée de cet enregistrement est invalide.'));
  if (res.destroyed) return;

  const language = metadata.data.language ?? currentLanguage();
  const reportedDuration = Math.max(metadata.data.durationSeconds ?? 0, file.size / 16_000);
  const client = new AbortController();
  const stop = () => client.abort();
  res.once('close', stop);
  const signal = AbortSignal.any([client.signal, transcriptionDeadline, AbortSignal.timeout(60_000)]);
  const started = performance.now();
  let result: Awaited<ReturnType<typeof requestTranscription>> | undefined;
  let upstreamStatus: number | undefined;
  try {
    result = await requestTranscription(engine, file.buffer, format, language, signal, status => {
      upstreamStatus = status;
    });
  } catch {
    if (!res.destroyed) throw new AppError(t('La transcription audio a échoué.'), 502);
  } finally {
    res.off('close', stop);
    await recordTranscriptionUsage({
      tenantId,
      userId,
      provider: engine.provider,
      model: engine.model,
      status: result ? 'ok' : client.signal.aborted ? 'aborted' : 'error',
      upstreamStatus,
      durationMs: Math.round(performance.now() - started),
      audioSeconds: Math.min(3600, Math.ceil(Math.max(reportedDuration, result?.durationSeconds ?? 0))),
      inputTokens: result?.inputTokens,
      outputTokens: result?.outputTokens
    });
  }
  if (res.destroyed || !result) return;
  res.set('Cache-Control', 'private, no-store');
  res.json({
    success: true,
    data: {
      text: result.text.trim().slice(0, COPILOT_MAX_MESSAGE_CHARS),
      language: result.language ?? language,
      durationSeconds: Math.min(3600, Math.max(reportedDuration, result.durationSeconds ?? 0))
    }
  });
});
