import { z } from 'zod';
import { env } from '../config/env';
import { t } from '../i18n';
import { AppError, asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { COPILOT_MAX_MESSAGE_CHARS } from '../lib/ai/contracts';

export const MAX_DICTATION_BYTES = 5 * 1024 * 1024;

function audioFormat(bytes: Buffer, mime: string): string | undefined {
  const type = mime.split(';')[0].toLowerCase();
  if (type === 'audio/webm' && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'webm';
  if (type === 'audio/ogg' && bytes.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (type === 'audio/mp4' && bytes.toString('ascii', 4, 8) === 'ftyp') return 'mp4';
  return undefined;
}

export const transcribeHandler = asyncHandler(async (req, res) => {
  const key = env.AI_TRANSCRIPTION_OPENAI_KEY;
  if (!key) throw new AppError(t('La transcription serveur est indisponible.'), 503);
  const file = req.file;
  const extension = file && file.size > 0 && audioFormat(file.buffer, file.mimetype);
  if (!file || !extension) throw new BadRequestError(t('Le format de cet enregistrement audio est invalide.'));

  if (res.destroyed) return;
  const input = new FormData();
  input.set('file', new Blob([new Uint8Array(file.buffer)], { type: 'audio/' + extension }), 'dictation.' + extension);
  input.set('model', env.AI_TRANSCRIPTION_MODEL);
  const controller = new AbortController();
  const stop = () => controller.abort();
  res.once('close', stop);
  const failed = () => new AppError(t('La transcription audio a échoué.'), 502);
  let raw: unknown;
  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: input,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw failed();
    }
    raw = await response.json();
  } catch {
    throw failed();
  } finally {
    res.off('close', stop);
  }
  const result = z.object({ text: z.string().trim() }).safeParse(raw);
  if (!result.success) throw failed();
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, data: { text: result.data.text.slice(0, COPILOT_MAX_MESSAGE_CHARS) } });
});
