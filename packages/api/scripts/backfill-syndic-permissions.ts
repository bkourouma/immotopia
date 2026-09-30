/**
 * Rattrapage des droits du module Syndic (BUG-2026-09-30-096).
 *
 * Les routes Syndic et `owner-statements` exigent désormais SYNDIC_VIEW /
 * SYNDIC_CREATE / SYNDIC_EDIT et OWNER_STATEMENTS_VIEW / OWNER_STATEMENTS_EDIT
 * (auparavant les droits PROPERTIES_*). Les rôles système sont GLOBAUX (une
 * ligne `roles` par clé, partagée par toutes les agences) : ce script met donc
 * à jour ces rôles, ce qui vaut pour toutes les agences existantes.
 *
 *  1. crée les 5 permissions si elles manquent ;
 *  2. les attribue à TENANT_ADMIN et TENANT_MANAGER (jamais à Agent ni Comptable) ;
 *  3. retire USERS_VIEW du rôle TENANT_AGENT (liste complète des collaborateurs).
 *
 * N'enlève aucune autre permission : rien n'est touché d'autre que les liens
 * listés ci-dessus. Idempotent ; relancer ne fait rien de plus.
 *
 * SIMULATION PAR DÉFAUT : sans `--apply`, rien n'est écrit et le rapport dit
 * ce qui le serait. Les droits étant mis en cache 5 minutes par utilisateur,
 * l'effet complet se voit au plus tard 5 minutes après `--apply`.
 *
 * Usage :
 *   npx ts-node packages/api/scripts/backfill-syndic-permissions.ts
 *   npx ts-node packages/api/scripts/backfill-syndic-permissions.ts --apply
 *   (--allow-production pour lever le refus sous NODE_ENV=production)
 */

import { prisma } from '../src/utils/database';
import { AGENT_REVOKED_KEYS, SYNDIC_ROLE_GRANTS, syndicPermissions } from '../prisma/seeds/syndic-permissions-seed';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');

if (process.env.NODE_ENV === 'production' && !args.includes('--allow-production')) {
  console.error('Refus de tourner : NODE_ENV=production (ajouter --allow-production en connaissance de cause).');
  process.exit(1);
}

async function main() {
  console.log(
    APPLY ? 'MODE --apply : les changements sont écrits.' : 'SIMULATION : rien n’est écrit (--apply pour appliquer).'
  );
  let created = 0;
  let granted = 0;
  let revoked = 0;

  for (const perm of syndicPermissions) {
    const existing = await prisma.permission.findUnique({ where: { key: perm.key } });
    if (!existing) {
      created += 1;
      console.log(`  + permission ${perm.key}`);
      if (APPLY) await prisma.permission.create({ data: perm });
    }
  }

  for (const [roleKey, keys] of Object.entries(SYNDIC_ROLE_GRANTS)) {
    const role = await prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) {
      console.warn(`  ! rôle ${roleKey} introuvable, ignoré`);
      continue;
    }
    for (const key of keys) {
      const permission = await prisma.permission.findUnique({ where: { key } });
      const link = permission
        ? await prisma.rolePermission.findUnique({
            where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }
          })
        : null;
      if (link) continue;
      granted += 1;
      console.log(`  + ${roleKey} <- ${key}`);
      if (APPLY) {
        const target = permission ?? (await prisma.permission.findUniqueOrThrow({ where: { key } }));
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: target.id } });
      }
    }
  }

  for (const [roleKey, keys] of Object.entries(AGENT_REVOKED_KEYS)) {
    const role = await prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) continue;
    for (const key of keys) {
      const permission = await prisma.permission.findUnique({ where: { key } });
      if (!permission) continue;
      const link = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }
      });
      if (!link) continue;
      revoked += 1;
      console.log(`  - ${roleKey} x ${key}`);
      if (APPLY) await prisma.rolePermission.delete({ where: { id: link.id } });
    }
  }

  console.log(
    `${APPLY ? 'Appliqué' : 'À faire'} : ${created} permission(s) créée(s), ${granted} affectation(s) ajoutée(s), ${revoked} retrait(s).`
  );
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
