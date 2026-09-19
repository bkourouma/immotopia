/**
 * Le coût réel d'un chantier — une seule définition, pour tout le module.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi ce fichier existe
 * ---------------------------------------------------------------------------
 *
 * Le filtre du réalisé — « imputations validées et non annulées » — s'était
 * retrouvé écrit **cinq fois** à la fin du lot 3 : deux fois dans `sites.ts`,
 * une dans `cost-allocation.ts`, une dans `purchase-orders.ts`, une dans
 * `budget-alerts.ts`. Chaque auteur avait pris soin de le recopier au
 * caractère près, et chacun l'avait dit en commentaire. Cela ne suffit pas :
 * cinq copies finissent par diverger, et c'est exactement le défaut n°4 du
 * lot 2, où trois agents avaient chacun écrit son amorçage du plan de comptes
 * avec des numéros différents.
 *
 * Une définition, un endroit. Si le filtre change, il change ici.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi ces fonctions prennent un client
 * ---------------------------------------------------------------------------
 *
 * Elles acceptent aussi bien le client global (`prisma`) qu'un client de
 * transaction (`tx`), parce que leurs appelants n'ont pas le même besoin :
 *
 *   - une lecture ordinaire passe par `prisma` ;
 *   - `syncWorkProgramCostTx` doit voir l'imputation qui vient d'être écrite
 *     dans SA transaction, pas encore visible du client global tant qu'elle
 *     n'a pas *commit*.
 *
 * C'est précisément le remaniement que l'en-tête de `cost-allocation.ts`
 * annonçait au lot 2 comme « un futur remaniement pourrait faire accepter un
 * client », et qui n'avait pas été fait parce qu'il touchait un fichier hors
 * du territoire de l'agent d'alors.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import { toAmountOrZero } from './types';

/**
 * Un client Prisma, global ou de transaction.
 *
 * Le type de la transaction suffit : c'est le plus étroit des deux, et le
 * client global le satisfait pour les deux méthodes utilisées ici.
 */
export type FinanceReadClient = PrismaTransactionClient;

/**
 * Somme des imputations **validées et non annulées** d'un chantier.
 *
 * C'est la définition du coût réel au sens du principe P-4 du PRD : jamais
 * saisi, toujours dérivé. Agrégation SQL, jamais en mémoire.
 */
export async function sumSiteActualCost(client: FinanceReadClient, tenantId: string, siteId: string): Promise<number> {
  const result = await client.costAllocation.aggregate({
    where: { tenantId, siteId, validatedAt: { not: null }, voidedAt: null },
    _sum: { amount: true }
  });
  return toAmountOrZero(result._sum.amount);
}

/**
 * La même somme, pour plusieurs chantiers d'un coup.
 *
 * Une seule agrégation groupée pour toute une page, jamais une requête par
 * ligne : le banc de charge du lot 0 a mesuré un facteur trente entre les deux
 * approches sur la balance clients.
 *
 * Les chantiers sans aucune imputation sont **absents** de la carte rendue.
 * L'appelant lit donc `?? 0`, ce qui est plus honnête qu'une entrée à zéro
 * fabriquée pour chaque chantier demandé.
 */
export async function sumSiteActualCostByIds(
  client: FinanceReadClient,
  tenantId: string,
  siteIds: string[]
): Promise<Map<string, number>> {
  if (siteIds.length === 0) {
    return new Map();
  }

  const rows = await client.costAllocation.groupBy({
    by: ['siteId'],
    where: { tenantId, siteId: { in: siteIds }, validatedAt: { not: null }, voidedAt: null },
    _sum: { amount: true }
  });

  return new Map<string, number>(
    (rows as Array<Record<string, any>>).map(row => [row.siteId as string, toAmountOrZero(row._sum?.amount)])
  );
}
