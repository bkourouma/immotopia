import { z } from 'zod';

/**
 * Corps et paramètres des routes d'agence de l'inventaire par WhatsApp
 * (lot 041, contrat `specs/041-inventaire-whatsapp/contracts/openapi.yaml`).
 *
 * Tous les corps sont `.strict()` : aucun corps ne répète un identifiant que le
 * chemin porte déjà (`tenantId`, `registrationId`, `captureId`, `sessionId`).
 * Les messages restent en français : le gestionnaire central les traduit par
 * `t()` (texte français = clé).
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identifiant de chemin ou de filtre : un UUID, rien d'autre. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

const uuid = z.string().regex(UUID_PATTERN, 'Identifiant invalide.');

const uniqueUuids = (max: number) =>
  z
    .array(uuid)
    .max(max, `${max} chantiers au plus.`)
    .refine(values => new Set(values).size === values.length, 'Un chantier figure deux fois.');

/** `?open=true|false` (query string). */
const booleanQuery = z.enum(['true', 'false']).transform(value => value === 'true');

const cursor = z.string().min(1).max(500);

/** `AAAA-MM`, mois de 01 à 12. */
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `AAAA-MM-JJ`. */
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z
  .string()
  .regex(datePattern, 'Date attendue au format AAAA-MM-JJ.')
  .refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Date invalide.');

// ---------------------------------------------------------------------------
// Passerelle et mesures
// ---------------------------------------------------------------------------

export const overviewQuerySchema = z.object({
  month: z.string().regex(monthPattern, 'Mois attendu au format AAAA-MM.').optional()
});

// ---------------------------------------------------------------------------
// Inscriptions
// ---------------------------------------------------------------------------

export const registrationStatusSchema = z.enum(['PENDING_ACTIVATION', 'ACTIVE', 'REVOKED']);

export const listRegistrationsQuerySchema = z.object({
  status: registrationStatusSchema.optional()
});

/**
 * Création. `siteIds` absent ou vide n'est pas une erreur de forme : le
 * contrôleur le refuse en `400 STOCK_WHATSAPP_SITES_REQUIRED` (code du contrat).
 * Le numéro est normalisé par le service (`normalizePhoneE164`).
 */
export const createRegistrationBodySchema = z
  .object({
    userId: z.string().trim().min(1, 'Choisissez un chef de chantier.').max(64),
    phone: z.string().max(40, 'Numéro trop long.'),
    siteIds: uniqueUuids(10).default([])
  })
  .strict();

export const updateRegistrationSitesBodySchema = z
  .object({
    siteIds: uniqueUuids(10).default([])
  })
  .strict();

export const revokeRegistrationBodySchema = z
  .object({
    reason: z.string().max(500, '500 caractères au plus.').optional()
  })
  .strict();

// ---------------------------------------------------------------------------
// Comptages terrain
// ---------------------------------------------------------------------------

export const fieldCountsQuerySchema = z.object({
  siteId: uuid.optional(),
  locationId: uuid.optional(),
  itemId: uuid.optional(),
  source: z.enum(['WHATSAPP', 'WEB']).optional(),
  cursor: cursor.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

// ---------------------------------------------------------------------------
// Captures
// ---------------------------------------------------------------------------

export const captureOutcomeSchema = z.enum([
  'RECEIVED',
  'PENDING',
  'ACCEPTED',
  'CORRECTED',
  'CANCELLED',
  'EXPIRED',
  'UNREADABLE',
  'UNRECOGNIZED',
  'FAILED'
]);

export const capturesQuerySchema = z
  .object({
    countId: uuid.optional(),
    locationId: uuid.optional(),
    itemId: uuid.optional(),
    outcome: captureOutcomeSchema.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    cursor: cursor.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .refine(value => !value.from || !value.to || value.from <= value.to, {
    message: 'La date de début dépasse la date de fin.',
    path: ['to']
  });

export const removeCapturePhotoBodySchema = z
  .object({
    reason: z.string().trim().min(3, 'Motif de 3 caractères au moins.').max(500, '500 caractères au plus.')
  })
  .strict();

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const sessionsQuerySchema = z.object({
  registrationId: uuid.optional(),
  open: booleanQuery.optional(),
  cursor: cursor.optional()
});

// ---------------------------------------------------------------------------
// Simulateur
// ---------------------------------------------------------------------------

const freePhone = z.string().trim().min(1).max(40);

/**
 * Message JSON du simulateur : exactement une cible (`registrationId` ou
 * `freePhone`) et exactement un contenu (`text` ou `replyId`).
 */
export const simulatorTextOrReplySchema = z
  .object({
    registrationId: uuid.optional(),
    freePhone: freePhone.optional(),
    text: z.string().min(1).max(1000).optional(),
    replyId: z.string().min(1).max(200).optional(),
    replyTitle: z.string().max(24).optional()
  })
  .strict()
  .refine(value => (value.registrationId === undefined) !== (value.freePhone === undefined), {
    message: 'Indiquez soit une inscription, soit un numéro libre.',
    path: ['registrationId']
  })
  .refine(value => (value.text === undefined) !== (value.replyId === undefined), {
    message: 'Indiquez soit un texte, soit une réponse de bouton.',
    path: ['text']
  })
  .refine(value => value.replyTitle === undefined || value.replyId !== undefined, {
    message: 'Un titre de réponse accompagne une réponse de bouton.',
    path: ['replyTitle']
  });

/** Champs texte du formulaire `multipart` (photo) du simulateur. */
export const simulatorPhotoFieldsSchema = z
  .object({
    registrationId: uuid.optional(),
    freePhone: freePhone.optional(),
    caption: z.string().max(200).optional()
  })
  .strict()
  .refine(value => (value.registrationId === undefined) !== (value.freePhone === undefined), {
    message: 'Indiquez soit une inscription, soit un numéro libre.',
    path: ['registrationId']
  });

export const simulatorConversationQuerySchema = z
  .object({
    registrationId: uuid.optional(),
    freePhone: freePhone.optional(),
    after: z
      .string()
      .max(40)
      .refine(value => !Number.isNaN(Date.parse(value)), 'Date invalide.')
      .optional()
  })
  .refine(value => (value.registrationId === undefined) !== (value.freePhone === undefined), {
    message: 'Indiquez soit une inscription, soit un numéro libre.',
    path: ['registrationId']
  });

export const advanceSimulatorClockBodySchema = z
  .object({
    minutes: z.union([z.literal(10), z.literal(30)])
  })
  .strict();

export type FieldCountsQuery = z.infer<typeof fieldCountsQuerySchema>;
export type CapturesQuery = z.infer<typeof capturesQuerySchema>;
export type SessionsQuery = z.infer<typeof sessionsQuerySchema>;
