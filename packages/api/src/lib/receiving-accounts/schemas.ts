import { z } from 'zod';
import { t } from '../../i18n';

/**
 * Corps des comptes de réception (spec 048, lot Q, contrat §1).
 *
 * Reçus en JSON ou en `multipart/form-data` (champs texte + fichier `qr`) :
 * en multipart tout arrive en chaîne, d'où la coercion des booléens et des
 * entiers. Une chaîne vide vaut « effacer » pour les champs facultatifs.
 */

/** Caractère de contrôle (hors saut de ligne et tabulation, tolérés dans les instructions). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// eslint-disable-next-line no-control-regex
const ANY_CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Texte d'une ligne, sans caractère de contrôle. */
const line = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(value => !ANY_CONTROL_CHARS.test(value), t('Caractères non autorisés.'));

/** Facultatif : absent = inchangé, vide ou null = effacé. */
const optionalLine = (max: number) =>
  z
    .union([z.null(), z.string().trim().max(max)])
    .refine(value => value === null || !ANY_CONTROL_CHARS.test(value), t('Caractères non autorisés.'))
    .transform(value => (value === null || value === '' ? null : value))
    .optional();

/** Alias : UUID v4 s'il en a la forme (mis en minuscules), sinon texte libre borné. */
export function normalizeAlias(value: string): string | null {
  if (UUID_SHAPE.test(value)) return UUID_V4.test(value) ? value.toLowerCase() : null;
  return value;
}

const aliasField = z
  .union([z.null(), z.string().trim().max(80)])
  .transform((value, ctx) => {
    if (value === null || value === '') return null;
    if (ANY_CONTROL_CHARS.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: t("L'alias contient des caractères non autorisés.") });
      return z.NEVER;
    }
    const alias = normalizeAlias(value);
    if (alias === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: t("L'alias a la forme d'un identifiant PI-SPI mais n'est pas un UUID v4 valide.")
      });
      return z.NEVER;
    }
    return alias;
  })
  .optional();

const instructionsField = z
  .union([z.null(), z.string().trim().max(500)])
  .refine(value => value === null || !CONTROL_CHARS.test(value), t('Caractères non autorisés.'))
  .transform(value => (value === null || value === '' ? null : value))
  .optional();

const booleanField = z.union([z.boolean(), z.enum(['true', 'false']).transform(value => value === 'true')]).optional();

const sortOrderField = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^\d{1,6}$/)
      .transform(Number)
  ])
  .pipe(z.number().int().min(0).max(100000))
  .optional();

/**
 * Version lue par le formulaire (`updatedAt` de la réponse, ISO 8601). Gardée en chaîne pour que le
 * corps reste valide à une seconde validation (contrôleur puis service) ; comparée en millisecondes.
 */
const expectedUpdatedAtField = z
  .string()
  .datetime({ offset: true, message: t('Version du compte invalide : rechargez la page.') })
  .optional();

export const createReceivingAccountBodySchema = z
  .object({
    institution: line(1, 60),
    scannableWith: optionalLine(80),
    alias: aliasField,
    holderName: line(2, 80),
    instructions: instructionsField,
    isActive: booleanField,
    sortOrder: sortOrderField
  })
  .strict();

export const updateReceivingAccountBodySchema = z
  .object({
    institution: line(1, 60).optional(),
    scannableWith: optionalLine(80),
    alias: aliasField,
    holderName: line(2, 80).optional(),
    instructions: instructionsField,
    isActive: booleanField,
    sortOrder: sortOrderField,
    removeQr: booleanField,
    expectedUpdatedAt: expectedUpdatedAtField
  })
  .strict();

export type CreateReceivingAccountBody = z.infer<typeof createReceivingAccountBodySchema>;
export type UpdateReceivingAccountBody = z.infer<typeof updateReceivingAccountBodySchema>;
