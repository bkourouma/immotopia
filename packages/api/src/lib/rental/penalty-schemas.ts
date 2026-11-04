import { z } from 'zod';
import { MONTANT_MAX } from './payment-schemas';

/**
 * Schéma Zod du corps de l'ajustement d'une pénalité
 * (`PATCH /rental/penalties/:penaltyId`). Module feuille, testable sans Prisma.
 */
export const updatePenaltySchema = z.object({
  amount: z
    .number({ invalid_type_error: 'Le montant retenu doit être un nombre.' })
    .finite('Le montant retenu doit être un nombre.')
    .min(0, 'Le montant retenu ne peut pas être négatif.')
    .max(MONTANT_MAX, 'Le montant dépasse le maximum autorisé (9 999 999 999,99).')
    .refine(v => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, 'Le montant retenu admet au plus 2 décimales.'),
  reason: z.string().trim().min(1, 'La raison de l’ajustement est obligatoire.')
});
