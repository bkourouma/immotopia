/**
 * Avancement physique d'un chantier — lot 3, volet pilotage.
 *
 * Implémente `RecordSiteProgressTx` et `ListSiteProgress` du contrat gelé
 * (`./types-lot3.ts`). Modèle de lecture-avant-écriture et de libellé
 * résolu : `lib/finance/cost-allocation.ts` (`syncWorkProgramCostTx`) et
 * `lib/finance/validation-queue.ts` (`labelCreator`).
 *
 * ---------------------------------------------------------------------------
 * Le point de vigilance de ce fichier : quelle saisie a le droit d'écrire
 * `ConstructionSite.progressPercent`.
 * ---------------------------------------------------------------------------
 *
 * L'historique (`SiteProgressEntry`) est un fait : on ajoute une ligne, on ne
 * modifie jamais la précédente. Mais `ConstructionSite.progressPercent` est
 * une COPIE — la seule de ce lot (`data-model.md` §2) — et elle ne doit
 * refléter que la saisie la plus récente **au sens de la date de saisie**
 * (`entryDate`), jamais de l'ordre dans lequel les saisies arrivent au
 * serveur.
 *
 * Sans cette précaution, une gestionnaire qui rattrape un relevé oublié la
 * semaine dernière (`entryDate` passée, saisi aujourd'hui) écraserait le
 * pourcentage d'un relevé plus récent déjà enregistré, et l'écran afficherait
 * un avancement qui recule sans qu'aucun avancement n'ait vraiment reculé —
 * seul l'ordre de saisie aurait changé.
 *
 * La règle retenue : après avoir inséré la nouvelle ligne, on relit la plus
 * récente du chantier en triant par `entryDate` DESC puis `createdAt` DESC
 * (le même ordre que `listSiteProgress`) ; si c'est bien la ligne qu'on vient
 * de créer, on recopie son pourcentage sur le chantier, sinon on ne touche à
 * rien. Le départage par `createdAt` pour une égalité de `entryDate` est une
 * hypothèse — voir le rapport de fin de tâche.
 */

import { prisma } from '../../utils/database';
import { NotFoundError, BadRequestError } from '../../middleware/error-middleware';
import type { RecordSiteProgressTx, ListSiteProgress, SiteProgressEntryRecord } from './types-lot3';

interface CreatorLike {
  fullName: string | null;
  email: string;
}

/** Nom lisible de l'auteur de la saisie, même convention que `validation-queue.ts` (`labelCreator`). */
function labelCreator(user: CreatorLike | null | undefined, userId: string): string {
  return user?.fullName || user?.email || `Utilisateur ${userId.slice(0, 8)}`;
}

const CREATOR_SELECT = { select: { fullName: true, email: true } } as const;

/** Même tri partout : la ligne la plus récente au sens de la date de saisie, en départageant par date d'enregistrement. */
const MOST_RECENT_FIRST = [{ entryDate: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }];

function toProgressRecord(row: Record<string, any>): SiteProgressEntryRecord {
  return {
    id: row.id,
    siteId: row.siteId,
    entryDate: row.entryDate,
    percent: row.percent,
    note: row.note ?? null,
    createdByUserId: row.createdByUserId,
    createdByLabel: labelCreator(row.createdBy, row.createdByUserId),
    createdAt: row.createdAt
  };
}

/** Voir `RecordSiteProgressTx` dans `./types-lot3.ts`. */
export const recordSiteProgressTx: RecordSiteProgressTx = async (tx, tenantId, params) => {
  // Borne défensive : le schéma Zod du contrôleur (`schemas-pilotage.ts`)
  // refuse déjà une valeur hors `[0, 100]`, mais cette fonction fait partie
  // du domaine et doit rester correcte pour tout appelant, pas seulement pour
  // celui qui passe par la route HTTP — même discipline que `createCashVoucherTx`
  // qui revalide un montant positif déjà validé par son schéma.
  if (!Number.isInteger(params.percent) || params.percent < 0 || params.percent > 100) {
    throw new BadRequestError("Le pourcentage d'avancement doit être un entier compris entre 0 et 100.");
  }

  const site = await tx.constructionSite.findFirst({ where: { id: params.siteId, tenantId } });
  if (!site) {
    throw new NotFoundError('Chantier introuvable.');
  }

  const created = await tx.siteProgressEntry.create({
    data: {
      tenantId,
      siteId: params.siteId,
      entryDate: params.entryDate,
      percent: params.percent,
      note: params.note?.trim() || null,
      createdByUserId: params.createdByUserId
    },
    include: { createdBy: CREATOR_SELECT }
  });

  // La saisie qu'on vient de créer est-elle la plus récente au sens de la
  // date de saisie ? On le sait en relisant le classement complet plutôt qu'en
  // comparant seulement à `entryDate` la plus haute déjà connue AVANT cet
  // insert : une seule requête, triée, dit à la fois « quelle est la plus
  // récente » et « est-ce bien celle-ci », sans risque d'oubli d'un
  // événement concurrent inséré entre-temps dans la même transaction.
  const mostRecent = await tx.siteProgressEntry.findFirst({
    where: { tenantId, siteId: params.siteId },
    orderBy: MOST_RECENT_FIRST
  });

  if (mostRecent?.id === created.id) {
    await tx.constructionSite.update({
      // `tenantId` en plus de l'id : anticipe le futur garde-fou Prisma (lot D).
      where: { id: params.siteId, tenantId },
      data: { progressPercent: created.percent }
    });
  }

  return toProgressRecord(created as Record<string, any>);
};

/** Voir `ListSiteProgress` dans `./types-lot3.ts`. */
export const listSiteProgress: ListSiteProgress = async (tenantId, siteId) => {
  const site = await prisma.constructionSite.findFirst({ where: { id: siteId, tenantId } });
  if (!site) {
    throw new NotFoundError('Chantier introuvable.');
  }

  const rows = await prisma.siteProgressEntry.findMany({
    where: { tenantId, siteId },
    include: { createdBy: CREATOR_SELECT },
    orderBy: MOST_RECENT_FIRST
  });

  return rows.map((row: Record<string, any>) => toProgressRecord(row));
};
