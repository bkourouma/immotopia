import { z } from 'zod';
import { CHARGE_ALLOCATION_LOT_TYPES } from './charge-allocation-methods';

/**
 * Corps de la route de mise à jour du barème par type de lot (menu lot 2).
 * `rates` associe un type de lot connu à un montant PAR LOT (>= 0, fini).
 * Types inconnus et clés en trop : 400. Au moins un montant.
 */

const rateAmountSchema = z.number().finite().min(0).max(9_999_999_999.99);

const ratesShape = Object.fromEntries(
  CHARGE_ALLOCATION_LOT_TYPES.map(type => [type, rateAmountSchema.optional()])
) as Record<(typeof CHARGE_ALLOCATION_LOT_TYPES)[number], z.ZodOptional<typeof rateAmountSchema>>;

export const lotTypeRatesSchema = z
  .object(ratesShape)
  .strict()
  .refine(rates => Object.values(rates).some(value => value !== undefined), {
    message: 'Renseignez au moins un montant par type de lot'
  });

export const updateLotTypeRatesSchema = z.object({ rates: lotTypeRatesSchema }).strict();

export type UpdateLotTypeRatesInput = z.infer<typeof updateLotTypeRatesSchema>;
