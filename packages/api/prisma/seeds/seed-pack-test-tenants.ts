/**
 * Crée UNE agence de test par pack d'abonnement, chacune avec un administrateur
 * à mot de passe connu. STAGING UNIQUEMENT (ADR-005, données de test) :
 *
 *   ./infra/scripts/seed-pack-tests.sh staging
 *
 * Idempotent : une agence déjà présente (par nom) n'est pas recréée, seuls le
 * mot de passe, la membership, le rôle, l'invitation et la fin d'essai sont
 * resynchronisés. Relançable sans doublon.
 *
 * Les agences passent par le vrai `provisionTenant` (tenant actif, modules,
 * abonnement, socle comptable, administrateur + rôle TENANT_ADMIN, invitation).
 * Le script rend ensuite le compte utilisable sans passer par l'invitation.
 * L'envoi de l'e-mail d'invitation (vers un domaine .test inexistant) échoue :
 * le service le tolère, et ni le lien ni le mot de passe ne sont jamais affichés.
 *
 * Lot 041 : les agences « 6 mois » Promoteur et Opérateur intégré reçoivent un
 * Chef de chantier inscrit au bot WhatsApp (numéro fictif) sur un chantier de
 * recette basculé au stock ; le Promoteur seul reçoit un bloc de l'option
 * Inventaire WhatsApp.
 *
 * Codes de sortie : 0 succès, 1 refus de la garde ou erreur.
 */
import './pack-history/disable-outbound';
import { GlobalRole, InvitationStatus, MembershipStatus } from '@prisma/client';
import { neutralizeOutbound, buildContext } from './pack-history/types';
import { historySeedersForPack } from './pack-history';
import { seedPropertyImages } from './pack-history/property-images';
import { env } from '../../src/config/env';
import { prisma, disconnectDatabase } from '../../src/utils/database';
import { hashPassword } from '../../src/utils/password-utils';
import { flushAuditEvents } from '../../src/services/audit-service';
import { provisionTenant } from '../../src/services/tenant-provisioning-service';
import { addSubscriptionItem } from '../../src/services/subscription-v2-service';
import { enableStockOnSiteTx } from '../../src/lib/finance/stock-rapprochement';
import { EXTENSION } from '../../src/lib/subscription/catalog';
import {
  PACK_TEST_MEMBERS,
  PACK_TEST_PASSWORD,
  PACK_TEST_TENANTS,
  PACK_TEST_WHATSAPP_OPTION_TENANTS,
  PACK_TEST_WHATSAPP_PHONE_PATTERN,
  PACK_TEST_WHATSAPP_REGISTRATIONS,
  PACK_TEST_WHATSAPP_SITE_NAME,
  checkPackTestTenantsGuard,
  type PackTestMember,
  type PackTestTenant,
  type PackTestWhatsappRegistration
} from './pack-test-tenants';

const FIVE_YEARS_MS = 5 * 365 * 24 * 60 * 60 * 1000;

class SeedRefusedError extends Error {}

async function findSuperAdminActor(): Promise<string> {
  const actor = await prisma.user.findFirst({
    where: { globalRole: GlobalRole.SUPER_ADMIN, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  });
  if (!actor) {
    throw new SeedRefusedError(
      "Aucun super-administrateur (PLATFORM_SUPER_ADMIN) n'existe en base : lancer bootstrap.sh d'abord."
    );
  }
  return actor.id;
}

/** Rend le compte administrateur directement utilisable (équivaut à une invitation acceptée). */
async function makeAdminUsable(tenantId: string, entry: PackTestTenant, passwordHash: string): Promise<string> {
  const now = new Date();
  const user = await prisma.user.findFirst({
    where: { email: { equals: entry.adminEmail, mode: 'insensitive' } },
    select: { id: true }
  });
  if (!user) {
    throw new Error(`Administrateur introuvable pour « ${entry.tenantName} ».`);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, emailVerified: true, isActive: true, fullName: entry.adminName }
  });

  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId } },
    update: { status: MembershipStatus.ACTIVE, acceptedAt: now },
    create: { userId: user.id, tenantId, status: MembershipStatus.ACTIVE, acceptedAt: now, invitedAt: now }
  });

  const role = await prisma.role.findFirst({
    where: { key: 'TENANT_ADMIN', scope: 'TENANT' },
    select: { id: true }
  });
  if (!role) {
    throw new Error('Le rôle TENANT_ADMIN est introuvable : vérifiez le seed des rôles plateforme.');
  }
  await prisma.userRole.createMany({ data: [{ userId: user.id, roleId: role.id, tenantId }], skipDuplicates: true });

  // Comme acceptInvitation : invitation ACCEPTED, acceptedBy/acceptedAt posés.
  await prisma.invitation.updateMany({
    where: { tenantId, email: { equals: entry.adminEmail, mode: 'insensitive' }, status: InvitationStatus.PENDING },
    data: { status: InvitationStatus.ACCEPTED, acceptedBy: user.id, acceptedAt: now }
  });

  // Essai, période et facturation repoussés à +5 ans : jamais de lecture seule.
  const far = new Date(now.getTime() + FIVE_YEARS_MS);
  await prisma.subscription.update({
    where: { tenantId },
    data: {
      trialEndsAt: far,
      currentPeriodEnd: far,
      nextBillingAt: far
    }
  });
  return user.id;
}

async function seedOne(
  entry: PackTestTenant,
  actorUserId: string,
  passwordHash: string
): Promise<{ outcome: 'créée' | 'resynchronisée'; tenantId: string; adminUserId: string }> {
  let existing = await prisma.tenant.findFirst({ where: { name: entry.tenantName }, select: { id: true } });
  if (!existing && entry.legacyTenantName) {
    // Agence créée avant les profils d'historique : on la renomme, on ne la recrée pas.
    const legacy = await prisma.tenant.findFirst({ where: { name: entry.legacyTenantName }, select: { id: true } });
    if (legacy) {
      await prisma.tenant.update({ where: { id: legacy.id }, data: { name: entry.tenantName } });
      existing = legacy;
    }
  }

  let tenantId: string;
  let outcome: 'créée' | 'resynchronisée';
  if (existing) {
    tenantId = existing.id;
    outcome = 'resynchronisée';
  } else {
    const { result } = await provisionTenant(
      {
        name: entry.tenantName,
        adminFullName: entry.adminName,
        adminEmail: entry.adminEmail,
        type: entry.tenantType,
        items: [{ code: entry.pack, quantity: 1 }]
      },
      actorUserId
    );
    tenantId = result.tenant.id;
    outcome = 'créée';
  }

  const adminUserId = await makeAdminUsable(tenantId, entry, passwordHash);
  return { outcome, tenantId, adminUserId };
}

/**
 * Compte de recette supplémentaire (Magasinier, Comptable, second
 * administrateur) : utilisateur, membership ACTIVE et rôle d'agence, mot de
 * passe connu. Idempotent : un compte existant est resynchronisé.
 */
async function seedMember(member: PackTestMember, tenantId: string, passwordHash: string): Promise<void> {
  const now = new Date();
  const role = await prisma.role.findFirst({ where: { key: member.roleKey, scope: 'TENANT' }, select: { id: true } });
  if (!role) {
    throw new Error(`Le rôle ${member.roleKey} est introuvable : vérifiez les migrations et le seed des rôles.`);
  }
  const existing = await prisma.user.findFirst({
    where: { email: { equals: member.email, mode: 'insensitive' } },
    select: { id: true }
  });
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash, emailVerified: true, isActive: true, fullName: member.fullName },
        select: { id: true }
      })
    : await prisma.user.create({
        data: {
          email: member.email,
          passwordHash,
          fullName: member.fullName,
          globalRole: GlobalRole.USER,
          emailVerified: true,
          isActive: true
        },
        select: { id: true }
      });
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId } },
    update: { status: MembershipStatus.ACTIVE, acceptedAt: now },
    create: { userId: user.id, tenantId, status: MembershipStatus.ACTIVE, acceptedAt: now, invitedAt: now }
  });
  await prisma.userRole.createMany({ data: [{ userId: user.id, roleId: role.id, tenantId }], skipDuplicates: true });
}

/**
 * Chantier de recette de l'inventaire par WhatsApp (lot 041) : créé s'il manque,
 * basculé au stock par la vraie fonction du lot 5 (lieu de chantier créé avec
 * lui), jamais rebasculé. Rend son identifiant.
 */
async function ensureWhatsappRecetteSite(tenantId: string, adminUserId: string): Promise<string> {
  const site =
    (await prisma.constructionSite.findFirst({
      where: { tenantId, name: PACK_TEST_WHATSAPP_SITE_NAME },
      select: { id: true, stockEnabledAt: true }
    })) ??
    (await prisma.constructionSite.create({
      data: { tenantId, name: PACK_TEST_WHATSAPP_SITE_NAME, status: 'IN_PROGRESS', managerId: adminUserId },
      select: { id: true, stockEnabledAt: true }
    }));
  if (!site.stockEnabledAt) {
    await prisma.$transaction(tx =>
      enableStockOnSiteTx(tx, tenantId, site.id, { enabledAt: new Date(), enabledByUserId: adminUserId })
    );
  }
  return site.id;
}

/**
 * Inscription WhatsApp de recette (lot 041, plan §7.6) : ACTIVE, affectée au
 * chantier de recette. Idempotente : une inscription vivante du même numéro
 * pour le même chef est resynchronisée ; un numéro vivant ailleurs, ou un chef
 * déjà inscrit sous un autre numéro, n'est pas touché (journal sans le numéro).
 */
async function seedWhatsappRegistration(
  registration: PackTestWhatsappRegistration,
  tenantId: string,
  adminUserId: string
): Promise<void> {
  if (!PACK_TEST_WHATSAPP_PHONE_PATTERN.test(registration.phoneE164)) {
    throw new SeedRefusedError(`Numéro de recette hors de la plage fictive pour ${registration.memberEmail}.`);
  }
  const member = await prisma.user.findFirst({
    where: { email: { equals: registration.memberEmail, mode: 'insensitive' } },
    select: { id: true }
  });
  if (!member) throw new Error(`Chef de chantier introuvable : ${registration.memberEmail}.`);
  const siteId = await ensureWhatsappRecetteSite(tenantId, adminUserId);

  const live = await prisma.stockWhatsappRegistration.findFirst({
    where: { phoneE164: registration.phoneE164, status: { not: 'REVOKED' } },
    select: { id: true, tenantId: true, userId: true }
  });
  let registrationId: string;
  if (live) {
    if (live.tenantId !== tenantId || live.userId !== member.id) {
      console.log(
        `  Inscription WhatsApp ignorée : le numéro de ${registration.memberEmail} est déjà inscrit ailleurs.`
      );
      return;
    }
    await prisma.stockWhatsappRegistration.update({
      where: { id: live.id },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date(),
        activationCodeHash: null,
        activationExpiresAt: null,
        activationAttempts: 0
      }
    });
    registrationId = live.id;
  } else {
    const memberTaken = await prisma.stockWhatsappRegistration.findFirst({
      where: { tenantId, userId: member.id, status: { not: 'REVOKED' } },
      select: { id: true }
    });
    if (memberTaken) {
      console.log(
        `  Inscription WhatsApp ignorée : ${registration.memberEmail} est déjà inscrit sous un autre numéro.`
      );
      return;
    }
    registrationId = (
      await prisma.stockWhatsappRegistration.create({
        data: {
          tenantId,
          userId: member.id,
          phoneE164: registration.phoneE164,
          status: 'ACTIVE',
          activatedAt: new Date(),
          createdByUserId: adminUserId
        },
        select: { id: true }
      })
    ).id;
  }
  await prisma.stockWhatsappRegistrationSite.createMany({
    data: [{ tenantId, registrationId, siteId }],
    skipDuplicates: true
  });
  console.log(`  Inscription WhatsApp de recette active : ${registration.memberEmail}.`);
}

/** Bloc `EXT_INVENTAIRE_WHATSAPP` (500 photos) ajouté par le vrai service s'il manque. */
async function ensureWhatsappOption(tenantId: string, actorUserId: string): Promise<void> {
  const held = await prisma.subscriptionItem.findFirst({
    where: { tenantId, status: { not: 'ENDED' }, catalogItem: { code: EXTENSION.INVENTAIRE_WHATSAPP } },
    select: { id: true }
  });
  if (held) return;
  await addSubscriptionItem(
    tenantId,
    { code: EXTENSION.INVENTAIRE_WHATSAPP, quantity: 1, note: 'Recette du lot 041 (inventaire par WhatsApp).' },
    actorUserId
  );
  console.log(`  Option ${EXTENSION.INVENTAIRE_WHATSAPP} ajoutée (1 bloc).`);
}

/** Reconstitue 6 mois ou 3 ans d'historique par module du pack (idempotent, voir pack-history/). */
async function seedHistory(entry: PackTestTenant, tenantId: string, adminUserId: string): Promise<void> {
  const ctx = buildContext(
    {
      prisma,
      tenantId,
      adminUserId,
      profile: entry.profile,
      log: message => console.log(`  [${entry.tenantName}] ${message}`)
    },
    entry.tenantName
  );
  for (const seeder of historySeedersForPack(entry.pack)) {
    // eslint-disable-next-line no-await-in-loop -- séquentiel voulu : les modules partagent contacts et biens.
    await seeder(ctx);
  }
  // Photos des biens : indépendant de l'historique (idempotent), donc aussi pour les agences déjà peuplées.
  await seedPropertyImages(ctx);
}

async function main(): Promise<number> {
  // Garde EN TÊTE, avant toute requête base. Origines lues via config/env (chemin normal du dépôt) ;
  // CLIENT_URL (alias prioritaire de frontendUrl) et FRONTEND_URL sont contrôlées toutes deux.
  const guard = checkPackTestTenantsGuard({
    allowFlag: process.env.ALLOW_PACK_TEST_TENANTS,
    nodeEnv: env.NODE_ENV,
    origins: [env.FRONTEND_URL, env.CLIENT_URL]
  });
  if (!guard.ok) {
    console.error(guard.reason);
    return 1;
  }

  // PACK_TEST_HISTORY=0 : crée les agences sans leur historique (diagnostic).
  const withHistory = process.env.PACK_TEST_HISTORY !== '0';
  if (withHistory) neutralizeOutbound();

  const actorUserId = await findSuperAdminActor();
  const passwordHash = await hashPassword(PACK_TEST_PASSWORD);

  for (const entry of PACK_TEST_TENANTS) {
    // eslint-disable-next-line no-await-in-loop -- séquentiel voulu : un journal lisible, une agence à la fois.
    const { outcome, tenantId, adminUserId } = await seedOne(entry, actorUserId, passwordHash);
    console.log(`Agence ${outcome} : ${entry.tenantName} (pack ${entry.pack}, administrateur ${entry.adminEmail}).`);
    if (withHistory) {
      // eslint-disable-next-line no-await-in-loop -- séquentiel voulu : un journal lisible.
      await seedHistory(entry, tenantId, adminUserId);
    }
    for (const member of PACK_TEST_MEMBERS.filter(m => m.tenantName === entry.tenantName)) {
      // eslint-disable-next-line no-await-in-loop -- séquentiel voulu : un journal lisible.
      await seedMember(member, tenantId, passwordHash);
      console.log(`  Compte de recette : ${member.email} (${member.roleKey}).`);
    }
    // Lot 041 : option et inscriptions WhatsApp de recette, APRÈS les comptes.
    if (PACK_TEST_WHATSAPP_OPTION_TENANTS.includes(entry.tenantName)) {
      // eslint-disable-next-line no-await-in-loop -- séquentiel voulu : un journal lisible.
      await ensureWhatsappOption(tenantId, actorUserId);
    }
    for (const registration of PACK_TEST_WHATSAPP_REGISTRATIONS.filter(r => r.tenantName === entry.tenantName)) {
      // eslint-disable-next-line no-await-in-loop -- séquentiel voulu : un journal lisible.
      await seedWhatsappRegistration(registration, tenantId, adminUserId);
    }
  }
  console.log(`${PACK_TEST_TENANTS.length} agences de test prêtes (idempotent : relançable sans doublon).`);
  return 0;
}

async function run(): Promise<void> {
  let exitCode = 0;
  try {
    exitCode = await main();
  } catch (error) {
    if (error instanceof SeedRefusedError) {
      console.error(error.message);
    } else {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.error('Erreur inattendue :', detail);
    }
    exitCode = 1;
  }

  const remaining = await flushAuditEvents();
  if (remaining > 0) {
    console.error(`${remaining} évènement(s) d'audit n'ont pas pu être écrits.`);
    exitCode = exitCode === 0 ? 1 : exitCode;
  }
  try {
    await disconnectDatabase();
  } catch (error) {
    console.error('Erreur lors de la déconnexion de la base :', error);
    exitCode = exitCode === 0 ? 1 : exitCode;
  }
  process.exitCode = exitCode;
  if (remaining > 0) process.exit(exitCode);
}

if (require.main === module) {
  void run();
}
