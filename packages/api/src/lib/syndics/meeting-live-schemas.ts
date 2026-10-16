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
 * Caracteres de controle (hors saut de ligne) et invisibles de mise en forme retires : controles
 * bidirectionnels U+202A-202E et U+2066-2069 (usurpation d'affichage), U+200B, U+2060, U+FEFF, U+00AD,
 * caracteres « tag » U+E0000-E007F. Sont GARDES : U+200C/U+200D (persan, ourdou, emojis composes) et
 * U+200E, U+200F, U+061C (marques directionnelles, usage legitime en arabe).
 */
const FORBIDDEN_CHARS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u00AD\u200B\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/gu;

/** Au moins un caractere visible : ni espace, ni caractere de format (`\p{Cf}`). */
const VISIBLE_CHAR = /[^\s\p{Cf}]/u;

/** Surrogates isoles (UTF-16 mal forme). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** `String.prototype.toWellFormed` (Node 20+), absent de la bibliotheque ES2020 du projet. */
function toWellFormed(text: string): string {
  const native = (text as string & { toWellFormed?: () => string }).toWellFormed;
  return typeof native === 'function' ? native.call(text) : text.replace(LONE_SURROGATE, '\uFFFD');
}

/**
 * Normalisation d'un message (spec 046, M3) : chaine bien formee (surrogates isoles remplaces), retours
 * chariot unifies en saut de ligne, controles et invisibles dangereux retires (voir `FORBIDDEN_CHARS`),
 * lignes d'espaces reduites, au plus deux sauts de ligne consecutifs, espaces de debut et de fin retires.
 * Un texte sans aucun caractere visible devient la chaine vide. Fonction pure ; le texte n'est jamais
 * interprete (ni HTML ni Markdown).
 */
export function normalizeDiscussionText(raw: string): string {
  const text = toWellFormed(raw)
    .replace(/\r\n?|\u2028|\u2029/g, '\n')
    .replace(FORBIDDEN_CHARS, '')
    .replace(/[^\S\n]+(?=\n)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return VISIBLE_CHAR.test(text) ? text : '';
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
