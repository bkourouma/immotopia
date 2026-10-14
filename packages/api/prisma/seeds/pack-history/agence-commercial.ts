/**
 * Compléments AGENCE, volet commercial : CRM (notes, étiquettes, recherches, communications, newsletters), mandats, ventes, documents.
 *
 * Complète l'historique du profil « 3 ans » : après 36 mois d'usage, aucun écran
 * du module ne doit être vide. Ne s'exécute que pour le profil 3y.
 *
 * Règles : voir `types.ts` (dates relatives, hasard seedé, aucun envoi sortant,
 * `tenantId` partout) ; IDEMPOTENT PAR BLOC (un bloc dont les lignes existent
 * déjà sur le tenant est sauté, pour compléter une agence déjà peuplée sans
 * purge) ; fichiers réels via `seed-files.ts`.
 *
 * Blocs (fichiers annexes) :
 *  - `agence-commercial-crm.ts`    fiches contact, étiquettes, notes, recherches, relances ;
 *  - `agence-commercial-ventes.ts` mandats de gestion et de vente, offres, compromis, commissions ;
 *  - `agence-commercial-docs.ts`   documents des biens et modèles de documents ;
 *  - `agence-commercial-comm.ts`   newsletters, notifications, invitations WhatsApp.
 *
 * Non alimentées, faute d'écran ou de service : `communications` et
 * `communication_preferences` (tables d'ébauche : un destinataire et un
 * statut, aucune route ni page).
 */
import { MembershipStatus } from '@prisma/client';
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import type { CommercialEnv } from './agence-commercial-data';
import {
  seedContactProfiles,
  seedFollowUps,
  seedNotes,
  seedSavedSearches,
  seedTags,
  seedTargetZones
} from './agence-commercial-crm';
import { seedVentes } from './agence-commercial-ventes';
import { seedDocumentTemplates, seedPropertyDocuments } from './agence-commercial-docs';
import { seedNewsletters, seedNotificationConfigs, seedWhatsappInvites } from './agence-commercial-comm';

export async function seedAgenceCommercial(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  const { prisma, tenantId, log } = ctx;

  const properties = await prisma.property.count({ where: { tenantId } });
  if (properties === 0) {
    log('seedAgenceCommercial : aucun bien (module agence non peuplé), rien à compléter.');
    return;
  }
  // Les services chargés ci-dessous lisent leur configuration d'envoi à l'import.
  neutralizeOutbound();

  const members = await prisma.membership.findMany({
    where: { tenantId, status: MembershipStatus.ACTIVE },
    select: { userId: true }
  });
  const staff = Array.from(new Set([ctx.adminUserId, ...members.map(m => m.userId)]));
  const env: CommercialEnv = {
    ctx,
    prisma,
    tenantId,
    adminUserId: ctx.adminUserId,
    staff,
    rng: ctx.rng,
    log,
    tag: tenantId.replace(/-/g, '').slice(0, 6)
  };

  const blocks: Array<[string, (e: CommercialEnv) => Promise<void>]> = [
    ['ventes et mandats', seedVentes],
    ['fiches contact', seedContactProfiles],
    ['étiquettes', seedTags],
    ['notes', seedNotes],
    ['recherches enregistrées', seedSavedSearches],
    ['relances', seedFollowUps],
    ['zones recherchées', seedTargetZones],
    ['documents des biens', seedPropertyDocuments],
    ['modèles de documents', seedDocumentTemplates],
    ['newsletters', seedNewsletters],
    ['notifications', seedNotificationConfigs],
    ['invitations WhatsApp', seedWhatsappInvites]
  ];

  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    for (const [label, run] of blocks) {
      try {
        // eslint-disable-next-line no-await-in-loop -- séquentiel voulu : les blocs se lisent entre eux.
        await run(env);
      } catch (error) {
        log(
          `seedAgenceCommercial : bloc « ${label} » en échec — ${error instanceof Error ? error.stack : String(error)}`
        );
      }
    }
  });
}
