import { z } from 'zod';

/**
 * Validation Zod du transfert entre lieux — extraite de
 * `schemas-stock-inventaire.ts` (lot 040, étape des fondations) **sans
 * changement de comportement**.
 *
 * `.strict()`, pour la raison du lot 5 : un corps ne répète jamais un
 * identifiant que le chemin porte déjà (le chemin porte `tenantId`), et un
 * champ inconnu — un prix, par exemple — reçoit un 400 explicite plutôt que
 * d'être jeté en silence.
 *
 * Les deux lieux sont dans le CORPS, et ce n'est pas une répétition : le
 * chemin ne porte que `tenantId`. AUCUN PRIX n'est reçu — la valeur part au
 * coût moyen du lieu d'origine (principe P-4), et un transfert n'écrit aucune
 * écriture comptable.
 *
 * Le même lieu des deux côtés est refusé par le domaine, pas ici : Zod valide
 * la forme d'un champ, et la relation entre deux champs est une règle métier
 * dont le domaine reste la seule autorité.
 *
 * La quantité **transférée** est strictement positive : déplacer zéro n'est
 * pas un geste, et un négatif serait un transfert à l'envers déguisé.
 */
export const createStockTransferSchema = z
  .object({
    fromLocationId: z.string().uuid('Identifiant de lieu d’origine invalide.'),
    toLocationId: z.string().uuid('Identifiant de lieu d’arrivée invalide.'),
    itemId: z.string().uuid('Identifiant d’article invalide.'),
    quantity: z
      .number({ invalid_type_error: 'La quantité doit être un nombre.' })
      .finite('La quantité doit être un nombre fini.')
      .gt(0, 'La quantité transférée doit être strictement positive.'),
    transferDate: z.coerce.date({ errorMap: () => ({ message: 'Date de transfert invalide.' }) })
  })
  .strict();

export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
