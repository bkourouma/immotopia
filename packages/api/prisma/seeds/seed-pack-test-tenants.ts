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
 * Codes de sortie : 0 succès, 1 refus de la garde ou erreur.
 */
import { GlobalRole, InvitationStatus, MembershipStatus } from '@prisma/client';
import { env } from '../../src/config/env';
import { prisma, disconnectDatabase } from '../../src/utils/database';
import { hashPassword } from '../../src/utils/password-utils';
import { flushAuditEvents } from '../../src/services/audit-service';
import { provisionTenant } from '../../src/services/tenant-provisioning-service';
import {
  PACK_TEST_PASSWORD,
  PACK_TEST_TENANTS,
  checkPackTestTenantsGuard,
  type PackTestTenant
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
async function makeAdminUsable(tenantId: string, entry: PackTestTenant, passwordHash: string): Promise<void> {
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
}

async function seedOne(
  entry: PackTestTenant,
  actorUserId: string,
  passwordHash: string
): Promise<'créée' | 'resynchronisée'> {
  const existing = await prisma.tenant.findFirst({ where: { name: entry.tenantName }, select: { id: true } });

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

  await makeAdminUsable(tenantId, entry, passwordHash);
  return outcome;
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

  const actorUserId = await findSuperAdminActor();
  const passwordHash = await hashPassword(PACK_TEST_PASSWORD);

  for (const entry of PACK_TEST_TENANTS) {
    // eslint-disable-next-line no-await-in-loop -- séquentiel voulu : un journal lisible, une agence à la fois.
    const outcome = await seedOne(entry, actorUserId, passwordHash);
    console.log(`Agence ${outcome} : ${entry.tenantName} (pack ${entry.pack}, administrateur ${entry.adminEmail}).`);
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
