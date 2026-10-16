import { z } from 'zod';
import { TOKEN_MAX_LENGTH } from '../secure-links';

/** Schemas zod de l'AG en direct (spec 043). */

export const attendanceStatusSchema = z.enum(['PRESENT', 'REPRESENTED', 'ABSENT']);
export const attendanceModeSchema = z.enum(['ONLINE', 'IN_PERSON']);

/** PUT /presences/:lotId */
export const setAttendanceSchema = z.object({
  status: attendanceStatusSchema,
  mode: attendanceModeSchema.optional(),
  representedByContactId: z.string().min(1).nullable().optional()
});

/** POST /presences (emargement en masse, 500 lots au plus) */
export const bulkAttendanceSchema = z.object({
  lotIds: z.array(z.string().uuid()).min(1).max(500),
  status: attendanceStatusSchema,
  mode: attendanceModeSchema.optional()
});

export const liveParamsSchema = z.object({
  lotId: z.string().uuid().optional(),
  resolutionId: z.string().uuid().optional(),
  contactId: z.string().min(1).max(100).optional()
});

/** Corps commun des routes publiques : le jeton, et rien d'autre n'est lu. */
export const publicTokenSchema = z.object({ token: z.string().min(1).max(TOKEN_MAX_LENGTH) });

/** POST /api/public/assemblees/voter */
export const publicVoteSchema = z.object({
  token: z.string().min(1).max(TOKEN_MAX_LENGTH),
  resolutionId: z.string().uuid(),
  votes: z
    .array(
      z.object({
        lotId: z.string().uuid(),
        vote: z.enum(['FOR', 'AGAINST', 'ABSTAIN'])
      })
    )
    .min(1)
    .max(200)
});

/** POST /public/assemblees/visio/main (spec 045) : le jeton et l'état de la main. */
export const publicHandSchema = publicTokenSchema.extend({ raised: z.boolean() });

/** Longueur maximale d'un message de la discussion de la visio (spec 046, M3). */
export const DISCUSSION_MAX_LENGTH = 500;

/**
 * Normalisation d'un message (spec 046, M3) : retours chariot unifies en saut de ligne, caracteres de
 * controle retires (sauf le saut de ligne), au plus deux sauts de ligne consecutifs, espaces de debut
 * et de fin retires. Fonction pure ; le texte n'est jamais interprete (ni HTML ni Markdown).
 */
export function normalizeDiscussionText(raw: string): string {
  return (
    raw
      .replace(/\r\n?|\u2028|\u2029/g, '\n')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/** Texte d'un message : normalise puis 1 a 500 caracteres. */
export const discussionBodySchema = z
  .string()
  .transform(normalizeDiscussionText)
  .pipe(z.string().min(1).max(DISCUSSION_MAX_LENGTH));

/** POST /api/public/assemblees/discussion/envoyer (spec 046) : le jeton et le texte. */
export const publicDiscussionSendSchema = publicTokenSchema.extend({ body: discussionBodySchema });

/** Corps des routes de la discussion du gestionnaire (spec 046). */
export const discussionSendSchema = z.object({ body: discussionBodySchema }).strict();
export const discussionHideSchema = z.object({ hidden: z.boolean() }).strict();
export const discussionStateSchema = z.object({ open: z.boolean() }).strict();
export const discussionWriteSchema = z.object({ allowed: z.boolean() }).strict();

/** Corps des routes de visio du gestionnaire (spec 045). */
export const visioSpeakSchema = z.object({ allowed: z.boolean() }).strict();
export const visioRemoveSchema = z.object({ revokeLinks: z.boolean().optional() }).strict();
