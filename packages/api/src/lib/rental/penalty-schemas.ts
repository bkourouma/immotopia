import { z } from 'zod';
import { MONTANT_MAX } from './payment-schemas';

/**
 * Schéma Zod du corps de l'ajustement d'une pénalité
 * (`PATCH /rental/penalties/:penaltyId`). Module feuille, testable sans Prisma.
 */
// Messages de validation Zod : traduits par le middleware d'erreur à l'exécution.
// @i18n-keys
const MSG_MONTANT_NOMBRE = 'Le montant retenu doit être un nombre.';
// @i18n-keys
const MSG_MONTANT_NEGATIF = 'Le montant retenu ne peut pas être négatif.';
// @i18n-keys
const MSG_MONTANT_DECIMALES = 'Le montant retenu admet au plus 2 décimales.';
// @i18n-keys
const MSG_RAISON_OBLIGATOIRE = 'La raison de l’ajustement est obligatoire.';

export const updatePenaltySchema = z.object({
  amount: z
    .number({ invalid_type_error: MSG_MONTANT_NOMBRE })
    .finite(MSG_MONTANT_NOMBRE)
    .min(0, MSG_MONTANT_NEGATIF)
    .max(MONTANT_MAX, 'Le montant dépasse le maximum autorisé (9 999 999 999,99).')
    .refine(v => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, MSG_MONTANT_DECIMALES),
  reason: z.string().trim().min(1, MSG_RAISON_OBLIGATOIRE)
});
