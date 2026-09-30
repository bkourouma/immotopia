/**
 * Seed des droits du module Syndic et des releves de gerance (BUG-096).
 *
 * Avant ce seed, toutes les routes Syndic et `owner-statements` etaient gardees
 * par les droits des BIENS (`PROPERTIES_*`) : un Agent (TENANT_AGENT), qui les
 * detient pour son travail de terrain, pouvait creer une copropriete (et
 * consommer le quota), lire les releves de gerance et toute la comptabilite de
 * copropriete. Le Syndic a desormais ses propres droits.
 *
 * Repartition :
 *  - TENANT_ADMIN  : tous les droits.
 *  - TENANT_MANAGER (gestionnaire) : tous les droits.
 *  - PLATFORM_SUPER_ADMIN : tous les droits (support sur une agence).
 *  - TENANT_ACCOUNTANT : aucun (il n'avait deja aucun droit PROPERTIES_*).
 *  - TENANT_AGENT : AUCUN. Decision la plus sure : copropriete, appels de
 *    charges, encaissements et releves de gerance sont des donnees financieres
 *    d'un tiers ; aucune spec ne prevoit une lecture pour le terrain. Un
 *    acces en lecture se donne explicitement (role personnalise) en accordant
 *    SYNDIC_VIEW.
 *
 * Idempotent : upsert des permissions et des affectations ; ne retire rien
 * (les retraits sont l'affaire du script `backfill-syndic-permissions.ts`).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const syndicPermissions = [
  { key: 'SYNDIC_VIEW', description: 'Consulter le module Syndic (coproprietes, lots, appels, finances, assemblees)' },
  { key: 'SYNDIC_CREATE', description: 'Creer une copropriete, des lots ou des appels de charges' },
  {
    key: 'SYNDIC_EDIT',
    description: 'Modifier le module Syndic : encaissements, relances, fonds, prestataires, factures, assemblees'
  },
  { key: 'OWNER_STATEMENTS_VIEW', description: 'Consulter les releves de gerance des proprietaires' },
  { key: 'OWNER_STATEMENTS_EDIT', description: 'Creer, recalculer et envoyer les releves de gerance' }
];

export const SYNDIC_ALL_KEYS = syndicPermissions.map(p => p.key);

/** Roles systeme qui recoivent les droits Syndic (les autres n'en ont aucun). */
export const SYNDIC_ROLE_GRANTS: Record<string, string[]> = {
  PLATFORM_SUPER_ADMIN: SYNDIC_ALL_KEYS,
  TENANT_ADMIN: SYNDIC_ALL_KEYS,
  TENANT_MANAGER: SYNDIC_ALL_KEYS
};

/** Droits retires au role Agent par le rattrapage (liste complete des collaborateurs). */
export const AGENT_REVOKED_KEYS: Record<string, string[]> = {
  TENANT_AGENT: ['USERS_VIEW']
};

async function seedSyndicPermissions() {
  console.log('🏢 Seeding Syndic permissions...\n');

  for (const perm of syndicPermissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: perm
    });
  }
  console.log(`  ✓ ${syndicPermissions.length} syndic permissions`);

  for (const [roleKey, keys] of Object.entries(SYNDIC_ROLE_GRANTS)) {
    const role = await prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) {
      console.warn(`  ⚠️  Role ${roleKey} not found, skipping...`);
      continue;
    }
    const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id }
      });
    }
    console.log(`  ✓ Assigned [${keys.join(', ')}] to ${roleKey}`);
  }
  // TENANT_AGENT et TENANT_ACCOUNTANT : aucun droit Syndic.
  console.log('\n✅ Syndic permissions seeding completed!\n');
}

if (require.main === module) {
  seedSyndicPermissions()
    .catch(e => {
      console.error('❌ Error seeding syndic permissions:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedSyndicPermissions };
