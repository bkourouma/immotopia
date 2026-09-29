import { z } from 'zod';
import type { PrismaTransactionClient } from '../../utils/database';
import { resolveOutflowTreasuryAccountTx } from './accounts';
import type { ResolvedTreasury } from './accounts';
import { assertTreasuryCanPayTx } from './balance';

/**
 * Compte de trésorerie qui PAIE un décaissement de chantier : règlement de
 * salaire, règlement de tâcheron, paiement de bail de terrain.
 *
 * Recette du 29 septembre 2026 (BUG-2026-09-29-032) : ces trois validations
 * créditaient toujours la caisse par défaut, sans contrôle de solde ni choix
 * du compte, et la caisse principale a fini à -3 766 000. Elles suivent
 * désormais la règle des règlements fournisseur : mode de règlement, compte
 * payeur (sinon celui par défaut du mode) et refus 400 « Solde insuffisant ».
 *
 * Ces trois pièces n'ont pas de colonne pour le mode ni pour le compte, et le
 * schéma n'est pas modifiable dans ce lot : le choix se fait donc à la
 * VALIDATION, moment où l'argent sort, et non à la saisie du brouillon. Sans
 * choix, le mode par défaut reste les espèces (la caisse), comme avant — mais
 * avec le contrôle de solde.
 */
export const OUTFLOW_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHECK', 'CARD', 'MOBILE_MONEY'] as const;

export const outflowPayerSchema = z.object({
  method: z.enum(OUTFLOW_PAYMENT_METHODS, { errorMap: () => ({ message: 'Mode de règlement invalide.' }) }).nullish(),
  treasuryAccountId: z.string().uuid('Identifiant de compte de trésorerie invalide.').nullish()
});

export interface OutflowPayer {
  method?: string | null;
  treasuryAccountId?: string | null;
}

/**
 * Résout le compte payeur, puis refuse (400) si son solde ne couvre pas
 * `amount`. À appeler dans la transaction qui poste l'écriture, juste avant.
 */
export async function resolveAndCheckOutflowTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  payer: OutflowPayer | null | undefined,
  amount: number
): Promise<ResolvedTreasury> {
  const treasury = await resolveOutflowTreasuryAccountTx(tx, tenantId, {
    method: payer?.method ?? 'CASH',
    treasuryAccountId: payer?.treasuryAccountId ?? null
  });
  await assertTreasuryCanPayTx(tx, tenantId, treasury, amount);
  return treasury;
}
