import { PrismaClient, MembershipStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Backfill RBAC : attribue un rôle aux memberships qui n'en ont aucun.
 *
 * Un utilisateur peut être membre actif d'un tenant sans aucune ligne
 * user_roles (cas des bases seedées avant que le seed principal ne crée les
 * rôles) : il se connecte, voit son agence, mais n'a strictement aucune
 * permission. Ce script répare ces comptes.
 *
 * Usage :
 *   npx ts-node prisma/seeds/assign-rbac-roles.ts
 *   npx ts-node prisma/seeds/assign-rbac-roles.ts --role=TENANT_ADMIN
 *   npx ts-node prisma/seeds/assign-rbac-roles.ts --tenant=agence-mali --dry-run
 *
 * Le rôle par défaut est TENANT_AGENT (moindre privilège) : élevez ensuite les
 * comptes concernés avec assign-tenant-admin.ts.
 */

function readFlag(name: string): string | undefined {
    const prefix = `--${name}=`;
    const arg = process.argv.find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
}

async function main() {
    const roleKey = readFlag('role') || process.env.DEFAULT_TENANT_ROLE || 'TENANT_AGENT';
    const tenantRef = readFlag('tenant');
    const dryRun = process.argv.includes('--dry-run');

    console.log('🔐 Backfill des rôles RBAC manquants...\n');
    console.log(`   Rôle appliqué : ${roleKey}`);
    console.log(`   Tenant ciblé  : ${tenantRef || 'tous'}`);
    console.log(`   Mode          : ${dryRun ? 'dry-run (aucune écriture)' : 'écriture'}\n`);

    const role = await prisma.role.findUnique({ where: { key: roleKey } });

    if (!role) {
        console.error(`❌ Rôle "${roleKey}" introuvable.`);
        console.log('💡 Lancez d\'abord : npm run db:seed:rbac');
        process.exit(1);
    }

    let tenantId: string | undefined;

    if (tenantRef) {
        const tenant =
            (await prisma.tenant.findUnique({ where: { slug: tenantRef } })) ||
            (await prisma.tenant.findUnique({ where: { id: tenantRef } }));

        if (!tenant) {
            console.error(`❌ Tenant "${tenantRef}" introuvable (ni par slug, ni par id).`);
            process.exit(1);
        }

        tenantId = tenant.id;
    }

    const memberships = await prisma.membership.findMany({
        where: {
            status: MembershipStatus.ACTIVE,
            ...(tenantId ? { tenantId } : {})
        },
        include: {
            user: { select: { email: true } },
            tenant: { select: { slug: true } }
        }
    });

    let assigned = 0;
    let alreadyOk = 0;

    for (const membership of memberships) {
        const existingRoles = await prisma.userRole.count({
            where: { userId: membership.userId, tenantId: membership.tenantId }
        });

        if (existingRoles > 0) {
            alreadyOk++;
            continue;
        }

        if (!dryRun) {
            await prisma.userRole.create({
                data: {
                    userId: membership.userId,
                    roleId: role.id,
                    tenantId: membership.tenantId
                }
            });
        }

        console.log(`  ${dryRun ? '·' : '✓'} ${membership.user.email} → ${membership.tenant.slug} (${roleKey})`);
        assigned++;
    }

    console.log('\n✅ Terminé.');
    console.log(`   • Memberships inspectés : ${memberships.length}`);
    console.log(`   • Déjà pourvus d'un rôle : ${alreadyOk}`);
    console.log(`   • ${dryRun ? 'À corriger' : 'Corrigés'} : ${assigned}`);
    console.log('');
}

main()
    .catch((e) => {
        console.error('❌ Erreur pendant le backfill RBAC :', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
