import { z } from 'zod';
import { env } from '../../config/env';
import {
  EXTERNAL_ACCESS_SECTIONS,
  EXTERNAL_ACCESS_TYPES,
  MAX_DOCUMENTS_PER_GRANT,
  MAX_ENTITIES_PER_GRANT,
  MAX_PROPERTIES_PER_GRANT
} from './sections';

/**
 * Entrées de l'API d'agence des accès tiers (lot B3). Tous les schémas sont
 * `.strict()` : un champ non prévu est rejeté plutôt qu'ignoré. Les listes
 * sont bornées ; les identifiants sont des chaînes courtes, vérifiées ensuite
 * par agence (jamais utilisées telles quelles dans une requête).
 */

const idString = z.string().trim().min(1).max(64);

/** Date ISO strictement future (l'heure est celle du serveur au moment de la saisie). */
const futureIsoDate = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine(value => !Number.isNaN(Date.parse(value)), "La date d'expiration est invalide.")
  .transform(value => new Date(value))
  .refine(date => date.getTime() > Date.now(), "La date d'expiration doit être dans le futur.");

const uniqueIds = (max: number) =>
  z
    .array(idString)
    .max(max)
    .transform(ids => Array.from(new Set(ids)));

const sectionsSchema = z
  .array(z.enum(EXTERNAL_ACCESS_SECTIONS))
  .min(1, 'Choisissez au moins une rubrique.')
  .max(EXTERNAL_ACCESS_SECTIONS.length);

const recipientNameSchema = z.string().trim().min(1).max(120);
const recipientEmailSchema = z
  .string()
  .trim()
  .max(254)
  .email("L'adresse e-mail du bénéficiaire est invalide.")
  .transform(value => value.toLowerCase());

const linkTtlDaysSchema = z.number().int().min(1).max(env.SECURE_LINK_MAX_TTL_DAYS);

export const createGrantSchema = z
  .object({
    type: z.enum(EXTERNAL_ACCESS_TYPES),
    recipientName: recipientNameSchema,
    recipientEmail: recipientEmailSchema,
    ownerClientId: idString.nullish(),
    propertyIds: uniqueIds(MAX_PROPERTIES_PER_GRANT).default([]),
    entityIds: z
      .array(z.string().uuid())
      .max(MAX_ENTITIES_PER_GRANT)
      .transform(ids => Array.from(new Set(ids)))
      .default([]),
    sections: sectionsSchema.optional(),
    documentIds: uniqueIds(MAX_DOCUMENTS_PER_GRANT).default([]),
    expiresAt: futureIsoDate.nullish(),
    linkTtlDays: linkTtlDaysSchema.optional(),
    sendEmail: z.boolean().optional()
  })
  .strict();
export type CreateGrantInput = z.infer<typeof createGrantSchema>;

export const updateGrantSchema = z
  .object({
    sections: sectionsSchema.optional(),
    expiresAt: futureIsoDate.nullish(),
    recipientName: recipientNameSchema.optional(),
    recipientEmail: recipientEmailSchema.optional(),
    propertyIds: uniqueIds(MAX_PROPERTIES_PER_GRANT).optional(),
    entityIds: z
      .array(z.string().uuid())
      .max(MAX_ENTITIES_PER_GRANT)
      .transform(ids => Array.from(new Set(ids)))
      .optional(),
    documentIds: uniqueIds(MAX_DOCUMENTS_PER_GRANT).optional()
  })
  .strict()
  .refine(body => Object.keys(body).length > 0, 'Aucune modification à enregistrer.');
export type UpdateGrantInput = z.infer<typeof updateGrantSchema>;

export const sendLinkSchema = z
  .object({
    linkTtlDays: linkTtlDaysSchema.optional(),
    revokePreviousLinks: z.boolean().optional(),
    sendEmail: z.boolean().optional()
  })
  .strict();
export type SendLinkInput = z.infer<typeof sendLinkSchema>;

export const accessLogQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }).strict();

export const grantIdParamSchema = idString;
