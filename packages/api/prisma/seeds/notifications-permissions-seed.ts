/**
 * Seed du droit de consulter le journal des notifications de l'agence
 * (menu lot 3) : qui a ete notifie de quoi, par quel canal, avec quel resultat,
 * et relance d'un envoi en echec.
 *
 * Repartition :
 *  - TENANT_ADMIN et TENANT_MANAGER : oui.
 *  - PLATFORM_SUPER_ADMIN : recoit tout via rbac-seed (support).
 *  - TENANT_AGENT, TENANT_ACCOUNTANT : non. Un acces se donne explicitement a
 *    un role personnalise.
 *
 * Idempotent : upsert de la permission et des affectations ; ne retire rien.
 * La migration `20261019180000_notifications_messagerie` fait la meme chose
 * pour toute base qui applique les migrations sans rejouer le seed.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const notificationsPermissions = [
  {
    key: 'TENANT_NOTIFICATIONS_ADMIN',
    description: "Consulter le journal des notifications de l'agence et relancer un envoi en echec"
  }
];

export const NOTIFICATIONS_ALL_KEYS = notificationsPermissions.map(p => p.key);

export const NOTIFICATIONS_ROLE_GRANTS: Record<string, string[]> = {
  TENANT_ADMIN: NOTIFICATIONS_ALL_KEYS,
  TENANT_MANAGER: NOTIFICATIONS_ALL_KEYS
};

async function seedNotificationsPermissions() {
  console.log('🔔 Seeding notifications permissions...\n');

  for (const perm of notificationsPermissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: perm
    });
  }
  console.log(`  ✓ ${notificationsPermissions.length} notifications permission(s)`);

  for (const [roleKey, keys] of Object.entries(NOTIFICATIONS_ROLE_GRANTS)) {
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
  console.log('\n✅ Notifications permissions seeding completed!\n');
}

if (require.main === module) {
  seedNotificationsPermissions()
    .catch(e => {
      console.error('❌ Error seeding notifications permissions:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedNotificationsPermissions };
