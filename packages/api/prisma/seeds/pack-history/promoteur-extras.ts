/**
 * Compléments PROMOTEUR : stock de chantier (lots 040/041), chantiers
 * supplémentaires, garanties, caisse de chantier, alertes, associations.
 *
 * Complète l'historique du profil « 3 ans » : après 36 mois d'usage, aucun écran
 * du module ne doit être vide. Ne s'exécute que pour le profil 3y.
 *
 * Règles : voir `types.ts` (dates relatives, hasard seedé, aucun envoi sortant,
 * `tenantId` partout) ; IDEMPOTENT PAR BLOC (un bloc dont les lignes existent
 * déjà sur le tenant est sauté, pour compléter une agence déjà peuplée sans
 * purge) ; fichiers réels via `seed-files.ts`.
 *
 * Territoire : ce fichier et `promoteur-extras-*.ts`. Le générateur de base
 * (`promoteur.ts`) n'est pas modifié ; ses chantiers sont complétés ici.
 *
 * Ordre : chronologie du stock (chantiers ajoutés, Angré, magasin central), caisse
 * de chantier, retenues de garantie, lots basculés au patrimoine, associations,
 * alertes de budget, puis pièces jointes terrain et état final des alertes.
 */
import { addDays, neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import { buildEnv } from './promoteur-extras-shared';
import type { Env } from './promoteur-extras-shared';
import { ensureStockBook, openStockSettings } from './promoteur-extras-stock';
import { runStockTimeline } from './promoteur-extras-timeline';
import { seedClientRequests, seedStockAttachments } from './promoteur-extras-field';
import {
  seedBudgetAlerts,
  seedCapitalization,
  seedCash,
  seedPartnerships,
  seedRetentions
} from './promoteur-extras-finance';

const ACK_NOTES: Record<string, string> = {
  LARGE_ISSUE: 'Sortie contrôlée avec le chef de chantier : conforme au planning de coulée',
  LARGE_SCRAP: 'Rebut constaté sur place et photographié, régularisé en comptabilité',
  COUNT_VARIANCE: 'Écart expliqué par la casse et les sacs durcis, régularisé à l’inventaire suivant',
  COUNT_LINE_SET_ASIDE: 'Articles repris au prochain inventaire',
  COUNT_CANCELLED: 'Comptage interrompu par la pluie, refait la semaine suivante',
  COUNT_SELF_VALIDATED: 'Validation par le seul responsable disponible, contrôlée par la direction',
  RECEIPT_REPEATED: 'Livraison en deux fois confirmée par le fournisseur',
  RECEIPT_OVER_INVOICE: 'Surplus repris par le fournisseur (retour enregistré)',
  RECEIPT_UNVALUED: 'Prix saisi à réception de la facture',
  CASH_MATERIAL_PURCHASE: 'Dépannage ciment : rupture chez le fournisseur habituel, pièce justifiée',
  FIELD_COUNT_CLOSED: 'Inventaire terrain contrôlé au bureau'
};

/**
 * État final des alertes de stock : les anciennes sont traitées (acquittées avec
 * une note), les récentes et les écarts non expliqués restent à traiter ; aucun
 * e-mail ne part pour aucune d'elles.
 */
async function finalizeStockAlerts(env: Env): Promise<void> {
  const { prisma, tenantId, ctx } = env;
  const alerts = await prisma.stockAlert.findMany({
    where: { tenantId, status: 'OPEN' },
    orderBy: { raisedAt: 'asc' }
  });
  const recent = addDays(ctx.end, -30);
  const instruction = addDays(ctx.end, -160);
  for (const a of alerts) {
    const keepOpen = a.raisedAt >= recent || (a.kind === 'COUNT_VARIANCE' && a.raisedAt >= instruction);
    await prisma.stockAlert.update({
      where: { id: a.id },
      data: {
        emailSkippedReason: 'DISABLED',
        ...(keepOpen
          ? {}
          : {
              status: 'ACKNOWLEDGED',
              acknowledgedAt: addDays(a.raisedAt, 1 + Math.floor(env.rng() * 4)),
              acknowledgedByUserId: env.admin,
              acknowledgeNote: ACK_NOTES[a.kind] ?? 'Point examiné avec le responsable du chantier'
            })
      }
    });
  }
}

export async function seedPromoteurExtras(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  neutralizeOutbound();
  const baseSites = await ctx.prisma.constructionSite.count({ where: { tenantId: ctx.tenantId } });
  if (baseSites === 0) {
    ctx.log('promoteur-extras : aucun chantier, le module de base n a pas tourné — rien à compléter');
    return;
  }
  const env = await buildEnv(ctx);
  // L'historique s'écrit dans le passé : la fenêtre d'antériorité des dates est ouverte le temps du seed.
  const settings = await openStockSettings(env);
  try {
    const book = await ensureStockBook(env);
    await runStockTimeline(env, book);
    await seedCash(env);
    await seedRetentions(env);
    await seedCapitalization(env);
    await seedPartnerships(env);
    await seedBudgetAlerts(env);
    await seedStockAttachments(env);
    await seedClientRequests(env);
    await finalizeStockAlerts(env);
  } finally {
    await settings.restore();
  }
}
