import { z } from 'zod';

/**
 * Schémas d'entrée de la régularisation foncière (spec 033), appelés avec
 * `.parse()` en tête de contrôleur. Tous `.strict()` : un champ inconnu est
 * rejeté plutôt qu'ignoré.
 */

const TRACKS = ['CI_ACD', 'PERSONNALISEE'] as const;
const REGULARIZATION_STATUSES = ['EN_COURS', 'TERMINEE', 'ABANDONNEE'] as const;
const STEP_STATUSES = ['A_FAIRE', 'EN_COURS', 'TERMINEE', 'BLOQUEE'] as const;

export const MAX_CUSTOM_STEPS = 30;
const MAX_COST_XOF = 999_999_999_999;

const uuid = z.string().uuid();
const label = z.string().trim().min(1).max(200);
const notes = z.string().trim().max(5000);
const reason = z.string().trim().max(500);

/**
 * Date saisie : texte non vide uniquement (refuse null, true, 0, qui seraient
 * convertis en 1970) et année comprise entre 1900 et 2200.
 */
const boundedDate = z
  .string()
  .trim()
  .min(1)
  .refine(
    value => {
      const date = new Date(value);
      const year = date.getUTCFullYear();
      return !Number.isNaN(date.getTime()) && year >= 1900 && year <= 2200;
    },
    { message: 'La date doit être valide et comprise entre 1900 et 2200.' }
  )
  .transform(value => new Date(value));

/** `null` reste `null` (pas de date). */
const dateOrNull = z.union([z.null(), boundedDate]);

const customStepInput = z
  .object({
    label,
    required: z.boolean().optional(),
    dueDate: dateOrNull.optional()
  })
  .strict();

export const listLandRegularizationsQuerySchema = z
  .object({
    propertyId: uuid.optional(),
    status: z.enum(REGULARIZATION_STATUSES).optional()
  })
  .strict();

export const createLandRegularizationSchema = z
  .object({
    propertyId: uuid,
    track: z.enum(TRACKS),
    startDate: boundedDate.optional(),
    notes: notes.optional(),
    steps: z.array(customStepInput).min(1).max(MAX_CUSTOM_STEPS).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.track === 'PERSONNALISEE' && !value.steps) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps'],
        message: 'Au moins une étape est obligatoire pour une filière personnalisée.'
      });
    }
    if (value.track === 'CI_ACD' && value.steps) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['steps'],
        message: 'Les étapes de la filière CI_ACD sont prédéfinies : le champ steps est interdit.'
      });
    }
  });

export const updateLandRegularizationSchema = z
  .object({
    notes: notes.nullable().optional(),
    startDate: boundedDate.optional()
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, { message: 'Au moins un champ est requis.' });

export const changeLandRegularizationStatusSchema = z
  .object({
    status: z.enum(REGULARIZATION_STATUSES),
    reason: reason.optional()
  })
  .strict();

export const addLandStepSchema = customStepInput;

export const updateLandStepSchema = z
  .object({
    label: label.optional(),
    required: z.boolean().optional(),
    dueDate: dateOrNull.optional(),
    costXof: z.number().finite().min(0).max(MAX_COST_XOF).optional(),
    notes: notes.nullable().optional(),
    documentId: uuid.nullable().optional()
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, { message: 'Au moins un champ est requis.' });

export const changeLandStepStatusSchema = z
  .object({
    status: z.enum(STEP_STATUSES),
    reason: reason.optional()
  })
  .strict();

export type CreateLandRegularizationInput = z.infer<typeof createLandRegularizationSchema>;
export type UpdateLandRegularizationInput = z.infer<typeof updateLandRegularizationSchema>;
export type ChangeLandRegularizationStatusInput = z.infer<typeof changeLandRegularizationStatusSchema>;
export type AddLandStepInput = z.infer<typeof addLandStepSchema>;
export type UpdateLandStepInput = z.infer<typeof updateLandStepSchema>;
export type ChangeLandStepStatusInput = z.infer<typeof changeLandStepStatusSchema>;
export type ListLandRegularizationsQuery = z.infer<typeof listLandRegularizationsQuerySchema>;
