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

/** Corps des routes de visio du gestionnaire (spec 045). */
export const visioSpeakSchema = z.object({ allowed: z.boolean() });
export const visioRemoveSchema = z.object({ revokeLinks: z.boolean().optional() });
