/**
 * Fonctions du socle CORE absentes de certains packs : newsletters, étiquettes et
 * contacts CRM (Patrimoine), identité de l'agence pour ses documents, réglages des
 * notifications e-mail et WhatsApp.
 *
 * 2e vague (recette « aucun écran vide » des comptes « 3 ans »). Ne s'exécute que pour le
 * profil 3y ; IDEMPOTENT PAR BLOC ; règles de `types.ts` ; fichiers réels via `seed-files.ts`.
 * Exécuté pour TOUS les packs, APRÈS les modules (les contacts et les données métier existent).
 *
 * Blocs (fichiers annexes) :
 *  - `core-communication-contacts.ts`   contacts CRM, rôles, étiquettes (Patrimoine) ;
 *  - `core-communication-newsletter.ts` listes, abonnés, modèles, campagnes (contenus dans
 *    `core-communication-content.ts`) ;
 *  - `core-communication-notif.ts`      réglages e-mail et WhatsApp ;
 *  - `core-communication-identity.ts`   fiche, logo, signature et cachet de l'agence.
 *
 * Volontairement non alimentées : `communications` et `communication_preferences` (tables
 * d'ébauche sans route ni écran). Il n'existe pas d'écran « historique des envois » : aucun
 * journal de messages n'est écrit.
 */
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { PACK_TEST_TENANTS } from '../pack-test-tenants';
import { neutralizeOutbound } from './types';
import type { HistoryContext } from './types';
import { seedPatrimoineContacts } from './core-communication-contacts';
import { seedNewsletterForPack } from './core-communication-newsletter';
import { seedNotificationSettings } from './core-communication-notif';
import { seedAgencyIdentity } from './core-communication-identity';

export async function seedCoreCommunication(ctx: HistoryContext): Promise<void> {
  if (ctx.profile !== '3y') return;
  const { prisma, tenantId, log } = ctx;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const pack = PACK_TEST_TENANTS.find(t => t.profile === '3y' && t.tenantName === tenant?.name)?.pack;
  if (!pack) {
    log('seedCoreCommunication : pack inconnu pour cette agence, rien à compléter.');
    return;
  }
  neutralizeOutbound();

  const blocks: Array<[string, () => Promise<void>]> = [
    ['identité de l’agence', () => seedAgencyIdentity(ctx, pack)],
    [
      'contacts CRM',
      async () => {
        if (pack === 'PATRIMOINE_ESSENTIEL' || pack === 'PATRIMOINE_PRO') await seedPatrimoineContacts(ctx, pack);
      }
    ],
    ['newsletters', () => seedNewsletterForPack(ctx, pack)],
    ['notifications', () => seedNotificationSettings(ctx, pack)]
  ];
  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    for (const [label, run] of blocks) {
      try {
        // eslint-disable-next-line no-await-in-loop -- séquentiel voulu : les newsletters lisent les contacts.
        await run();
      } catch (error) {
        log(
          `seedCoreCommunication : bloc « ${label} » en échec — ${error instanceof Error ? error.stack : String(error)}`
        );
      }
    }
  });
}
