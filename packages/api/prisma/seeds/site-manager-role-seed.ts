/**
 * Seed du rôle « Chef de chantier » — lot 041 (spec 041, W2, data-model §3).
 *
 * Crée le rôle global `TENANT_SITE_MANAGER` (portée `TENANT`) et lui attribue
 * son UNIQUE droit `STOCK_COUNT` (lot 040). Pas `STOCK_VIEW` : à l'aveugle
 * strict (W-D2, décision du Pilote du 04/10), le chef ne lit aucun solde ; il
 * compte par WhatsApp. Une agence qui veut lui ouvrir le web lui attribue en
 * plus un rôle qui porte `STOCK_VIEW` (spec W2-R1).
 *
 * Suppose les permissions `STOCK_*` déjà créées par `stock-permissions-seed.ts`
 * (appelé juste avant dans `rbac-seed.ts`).
 *
 * La migration de données `20261009090300_inventaire_whatsapp_role` fait la
 * même chose pour une base qui applique les migrations.
 */
import { PrismaClient, RoleScope } from '@prisma/client';

const prisma = new PrismaClient();

const SITE_MANAGER_ROLE = {
  key: 'TENANT_SITE_MANAGER',
  name: 'Tenant Site Manager',
  description:
    'Chef de chantier : compte le stock de ses chantiers, notamment par WhatsApp, sans valider ni acceder aux valeurs',
  scope: RoleScope.TENANT
};

/** Les droits du rôle : `STOCK_COUNT` seulement (spec W2-R1). */
const SITE_MANAGER_PERMISSION_KEYS = ['STOCK_COUNT'] as const;

async function seedSiteManagerRole() {
  console.log('🦺 Seeding TENANT_SITE_MANAGER role...');

  const role = await prisma.role.upsert({
    where: { key: SITE_MANAGER_ROLE.key },
    update: {},
    create: SITE_MANAGER_ROLE
  });

  const permissions = await prisma.permission.findMany({
    where: { key: { in: [...SITE_MANAGER_PERMISSION_KEYS] } },
    select: { id: true, key: true }
  });
  if (permissions.length !== SITE_MANAGER_PERMISSION_KEYS.length) {
    throw new Error(
      'Spec 041 : permission STOCK_COUNT absente — seedStockPermissions (lot 040) doit tourner avant ce seed.'
    );
  }

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id }
    });
  }
  console.log(`  ✓ Assigned [${SITE_MANAGER_PERMISSION_KEYS.join(', ')}] to ${SITE_MANAGER_ROLE.key}\n`);
}

// Execute if run directly
if (require.main === module) {
  seedSiteManagerRole()
    .catch(e => {
      console.error('❌ Error seeding site manager role:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedSiteManagerRole, SITE_MANAGER_ROLE, SITE_MANAGER_PERMISSION_KEYS };
