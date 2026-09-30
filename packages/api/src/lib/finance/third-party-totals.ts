/**
 * Cumuls facture / regle d'un compte de tiers — regle UNIQUE de la balance.
 *
 * **Regle comptable.** Annuler une piece ne cree pas de mouvement « reel » :
 * le grand livre ecrit une contrepassation (`sourceType = 'VOID'`,
 * `sourceId` = identifiant du mouvement d'origine, sens inverses, meme date).
 * Le solde du compte est juste puisque les deux lignes s'annulent, mais
 * additionner brutalement `debit` et `credit` faisait apparaitre la facture
 * annulee dans « Facture » et son annulation dans « Regle » (BUG-2026-09-30-041 :
 * Facture 7 000 000 / Regle 9 000 000 pour 6 000 000 factures et 8 000 000
 * decaisses). Ici, un mouvement annule ET sa contrepassation sont ecartes des
 * deux cumuls :
 *
 *   facture = somme des debits NON annules
 *   regle   = somme des credits NON annules
 *   solde   = facture − regle (le solde courant du compte reste la reference)
 *
 * L'annulation d'une facture apres reglement partiel n'annule que la facture :
 * les affectations du reglement restent, et le reglement devient de fait un
 * acompte (regle > facture, solde negatif = avoir du fournisseur).
 */

import { prisma } from '../../utils/database';
import { roundMoneyXof } from './money';
import { toAmountOrZero } from './types';

export interface MovementTotals {
  billed: number;
  settled: number;
}

/**
 * @param baseWhere filtre commun (tenant, comptes, periode, chantier) applique
 *   aux mouvements d'origine ; les contrepassations sont toujours ecartees.
 */
export async function sumNetMovementsByAccount(
  baseWhere: Record<string, unknown>
): Promise<Map<string, MovementTotals>> {
  const grouped = await prisma.thirdPartyMovement.groupBy({
    by: ['accountId'],
    where: { ...baseWhere, sourceType: { not: 'VOID' } } as any,
    _sum: { debit: true, credit: true }
  });

  const totals = new Map<string, { billed: number; settled: number }>();
  for (const group of grouped as any[]) {
    totals.set(group.accountId, {
      billed: toAmountOrZero(group._sum.debit),
      settled: toAmountOrZero(group._sum.credit)
    });
  }

  // Mouvements d'origine deja contrepasses : on les retire des cumuls.
  const originIds = (
    (await prisma.thirdPartyMovement.findMany({
      where: {
        tenantId: baseWhere.tenantId,
        accountId: baseWhere.accountId,
        sourceType: 'VOID'
      } as any,
      select: { sourceId: true }
    })) as Array<{ sourceId: string }>
  ).map(m => m.sourceId);

  if (originIds.length > 0) {
    const voided = (await prisma.thirdPartyMovement.findMany({
      where: { ...baseWhere, id: { in: originIds }, sourceType: { not: 'VOID' } } as any,
      select: { accountId: true, debit: true, credit: true }
    })) as Array<{ accountId: string; debit: unknown; credit: unknown }>;

    for (const movement of voided) {
      const entry = totals.get(movement.accountId);
      if (entry) {
        entry.billed -= toAmountOrZero(movement.debit as never);
        entry.settled -= toAmountOrZero(movement.credit as never);
      }
    }
  }

  const rounded = new Map<string, MovementTotals>();
  for (const [accountId, entry] of totals) {
    rounded.set(accountId, { billed: roundMoneyXof(entry.billed), settled: roundMoneyXof(entry.settled) });
  }
  return rounded;
}
