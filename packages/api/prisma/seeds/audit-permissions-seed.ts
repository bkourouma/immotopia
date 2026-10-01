/**
 * Seed du droit de consulter le journal d'activite de l'agence (ADR-006,
 * specs/023-audit-deux-niveaux, phase 2).
 *
 * Le journal montre qui a fait quoi dans l'agence, y compris les connexions et
 * les changements de droits : information de gouvernance, pas de travail
 * quotidien.
 *
 * Repartition :
 *  - TENANT_ADMIN : oui.
 *  - PLATFORM_SUPER_ADMIN : oui (support sur une agence).
 *  - TENANT_MANAGER, TENANT_AGENT, TENANT_ACCOUNTANT : non. Un acces se donne
 *    explicitement a un role personnalise en lui accordant TENANT_AUDIT_VIEW.
 *
 * Idempotent : upsert de la permission et des affectations ; ne retire rien.
 * Meme motif que `syndic-permissions-seed.ts`, et la migration
 * `20261007100000_audit_tenant_permission` fait la meme chose pour toute base
 * qui applique les migrations sans rejouer le seed.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const auditPermissions = [
  { key: 'TENANT_AUDIT_VIEW', description: "Consulter le journal d'activite de l'agence (qui a fait quoi, quand)" }
];

export const AUDIT_ALL_KEYS = auditPermissions.map(p => p.key);

/** Roles systeme qui recoivent le droit (les autres n'en ont aucun). */
export const AUDIT_ROLE_GRANTS: Record<string, string[]> = {
  PLATFORM_SUPER_ADMIN: AUDIT_ALL_KEYS,
  TENANT_ADMIN: AUDIT_ALL_KEYS
};

async function seedAuditPermissions() {
  console.log('📜 Seeding audit permissions...\n');

  for (const perm of auditPermissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: perm
    });
  }
  console.log(`  ✓ ${auditPermissions.length} audit permission(s)`);

  for (const [roleKey, keys] of Object.entries(AUDIT_ROLE_GRANTS)) {
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
  console.log('\n✅ Audit permissions seeding completed!\n');
}

if (require.main === module) {
  seedAuditPermissions()
    .catch(e => {
      console.error('❌ Error seeding audit permissions:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seedAuditPermissions };
