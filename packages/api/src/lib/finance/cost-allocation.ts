/**
 * Lien Patrimoine ↔ Finance — `WorkProgram.constructionSiteId` (lot 2, US12, FR-024).
 *
 * Le PRD voulait que `WorkProgram` *devienne* le chantier. La décision D5 a
 * tranché autrement (`data-model.md` §4) : `ConstructionSite` est une table
 * neuve, et `WorkProgram` reste l'objet « travaux sur un bien existant » du
 * Patrimoine. Les deux coexistent, et ce fichier est le seul pont entre eux :
 * dès que le lien est posé, le coût réel du programme cesse d'être saisi à la
 * main et devient dérivé du chantier (principe P-4 du PRD, appliqué ici à un
 * objet qui, jusque-là, laissait taper son coût au clavier).
 *
 * **Ce fichier vit dans `lib/finance/`, jamais dans `lib/patrimoine/`** : la
 * règle de couture du plan de mise en œuvre veut que le module Patrimoine
 * n'ait jamais à connaître le détail d'une imputation (`CostAllocation`),
 * seulement le résultat que ce fichier lui recopie.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import { sumSiteActualCost } from './site-cost';

/**
 * Recopie le coût réel d'un chantier sur chaque `WorkProgram` qui lui est
 * rattaché, dans la transaction `tx` où une imputation vient d'être validée
 * ou annulée.
 *
 * **Pourquoi ne pas réutiliser `getSiteActualCost` de `lib/finance/sites.ts`
 * telle quelle.** Cette fonction interroge le client Prisma global
 * (`prisma`), donc hors transaction : appelée ici, elle ne verrait pas
 * l'imputation qui vient d'être écrite dans `tx`, pas encore validée côté
 * base tant que `tx` n'a pas *commit*. Cette fonction refait donc le même
 * calcul (même filtre exact : imputations validées, non annulées, sommées
 * par agrégation SQL, jamais en mémoire), mais à travers `tx` — c'est la
 * seule façon de rester correct *et* de respecter la règle du dépôt selon
 * laquelle toute écriture passe par un client de transaction, puisque cette
 * lecture doit voir l'écriture qui vient de se produire dans la même
 * transaction. Un futur remaniement pourrait faire accepter un client
 * (`prisma` ou `tx`) à `getSiteActualCost` pour supprimer cette duplication ;
 * ce remaniement touche `sites.ts`, hors du territoire de cet agent (voir le
 * rapport de fin de tâche).
 *
 * Si aucun `WorkProgram` n'est rattaché à ce chantier, ne fait rien : un
 * programme de travaux sans chantier reste un objet du Patrimoine, son coût
 * reste saisi à la main, comme avant (US12, scénario 4).
 */
export async function syncWorkProgramCostTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  constructionSiteId: string
): Promise<void> {
  // Lecture avant écriture (piège PostgreSQL : une commande en échec annule
  // toute la transaction) : on vérifie qu'il existe au moins un programme
  // rattaché avant de calculer quoi que ce soit à lui recopier.
  const linkedCount = await tx.workProgram.count({
    where: { tenantId, constructionSiteId }
  });

  if (linkedCount === 0) {
    return;
  }

  // Meme definition du realise que partout ailleurs (`site-cost.ts`), mais lue
  // A TRAVERS `tx` : cette fonction doit voir l'imputation qui vient d'etre
  // ecrite dans cette transaction, invisible du client global tant qu'elle n'a
  // pas commit. C'est exactement le remaniement que l'en-tete de ce fichier
  // annoncait au lot 2 sans pouvoir le faire.
  const actualCost = await sumSiteActualCost(tx, tenantId, constructionSiteId);

  await tx.workProgram.updateMany({
    where: { tenantId, constructionSiteId },
    data: { actualCost }
  });
}
