import { PrismaClient, GlobalRole, TenantType, ClientType, MembershipStatus, TenantStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * This seed wipes users, tenants and every row that cascades from them
 * (156 cascading relations in the schema). Running it against a shared or
 * production database destroys all tenant data, so it refuses to run unless
 * the environment explicitly allows it.
 */
function assertDestructiveSeedAllowed(): void {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const optedIn = process.env.ALLOW_DESTRUCTIVE_SEED === '1' || process.env.ALLOW_DESTRUCTIVE_SEED === 'true';

    if (nodeEnv === 'production') {
        console.error('\n❌ Refus : ce seed efface toutes les données et NODE_ENV=production.\n');
        process.exit(1);
    }

    if (!optedIn) {
        console.error(
            [
                '',
                '❌ Refus : ce seed supprime TOUS les utilisateurs, tenants et données liées',
                `   sur la base ciblée par DATABASE_URL (NODE_ENV=${nodeEnv}).`,
                '',
                '   Pour confirmer, relancez avec :',
                '     bash / CI   : ALLOW_DESTRUCTIVE_SEED=1 npm run db:seed',
                '     PowerShell  : $env:ALLOW_DESTRUCTIVE_SEED="1"; npm run db:seed',
                '     cmd.exe     : set ALLOW_DESTRUCTIVE_SEED=1 && npm run db:seed',
                '',
                '   Sous Windows, setup-database.bat enchaîne toute la séquence.',
                ''
            ].join('\n')
        );
        process.exit(1);
    }
}

async function main() {
    assertDestructiveSeedAllowed();

    console.log('🗑️  Clearing existing data...');

    // Delete all data in correct order (respecting foreign keys)
    await prisma.emailVerificationToken.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.tenantClient.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.user.deleteMany();

    console.log('✅ All existing data cleared');

    // Hash password for all users
    const password = 'Test@123456';
    const passwordHash = await bcrypt.hash(password, 10);

    console.log('\n👤 Creating users...');

    // Create Super Admin (visitor - not linked to any tenant)
    const visitor = await prisma.user.create({
        data: {
            email: 'visitor@immobillier.com',
            passwordHash,
            fullName: 'Visiteur Non Lié',
            globalRole: GlobalRole.USER,
            emailVerified: true,
            isActive: true
        }
    });
    console.log('  ✓ Visitor created:', visitor.email);

    // Create Admin 1 for Tenant 1
    const admin1 = await prisma.user.create({
        data: {
            email: 'admin1@agence-mali.com',
            passwordHash,
            fullName: 'Amadou Koné',
            globalRole: GlobalRole.USER,
            emailVerified: true,
            isActive: true
        }
    });
    console.log('  ✓ Admin 1 created:', admin1.email);

    // Create Admin 2 for Tenant 2
    const admin2 = await prisma.user.create({
        data: {
            email: 'admin2@bamako-immo.com',
            passwordHash,
            fullName: 'Fatima Traoré',
            globalRole: GlobalRole.USER,
            emailVerified: true,
            isActive: true
        }
    });
    console.log('  ✓ Admin 2 created:', admin2.email);

    // Create Collaborator
    const collaborator = await prisma.user.create({
        data: {
            email: 'agent@agence-mali.com',
            passwordHash,
            fullName: 'Moussa Diarra',
            globalRole: GlobalRole.USER,
            emailVerified: true,
            isActive: true
        }
    });
    console.log('  ✓ Collaborator created:', collaborator.email);

    // Create Propriétaire (Owner)
    const proprietaire = await prisma.user.create({
        data: {
            email: 'proprietaire@gmail.com',
            passwordHash,
            fullName: 'Ibrahim Sanogo',
            globalRole: GlobalRole.USER,
            emailVerified: true,
            isActive: true
        }
    });
    console.log('  ✓ Propriétaire created:', proprietaire.email);

    // Create Locataire (Renter)
    const locataire = await prisma.user.create({
        data: {
            email: 'locataire@gmail.com',
            passwordHash,
            fullName: 'Mariam Coulibaly',
            globalRole: GlobalRole.USER,
            emailVerified: true,
            isActive: true
        }
    });
    console.log('  ✓ Locataire created:', locataire.email);

    console.log('\n🏢 Creating tenants...');

    // Create Tenant 1: Agence Mali
    const tenant1 = await prisma.tenant.create({
        data: {
            name: 'Agence Immobilière du Mali',
            slug: 'agence-mali',
            type: TenantType.AGENCY,
            website: 'https://agence-mali.com',
            // Le défaut du schéma est PENDING : sans ACTIVE explicite, le tenant
            // reste invisible pour tout ce qui filtre sur TenantStatus.ACTIVE
            // (statistiques plateforme, seed maintenance, etc.).
            status: TenantStatus.ACTIVE,
            isActive: true
        }
    });
    console.log('  ✓ Tenant 1 created:', tenant1.name);

    // Create Tenant 2: Bamako Immo
    const tenant2 = await prisma.tenant.create({
        data: {
            name: 'Bamako Immobilier',
            slug: 'bamako-immo',
            type: TenantType.AGENCY,
            website: 'https://bamako-immo.com',
            status: TenantStatus.ACTIVE,
            isActive: true
        }
    });
    console.log('  ✓ Tenant 2 created:', tenant2.name);

    console.log('\n🔗 Creating memberships and role assignments...');

    // Les rôles RBAC sont globaux : ils survivent au wipe ci-dessus tant que
    // db:seed:rbac a déjà tourné une fois. Sans eux, les comptes admin/agent
    // seraient créés sans aucun accès à leur tenant.
    const tenantAdminRole = await prisma.role.findUnique({ where: { key: 'TENANT_ADMIN' } });
    const tenantAgentRole = await prisma.role.findUnique({ where: { key: 'TENANT_AGENT' } });

    if (!tenantAdminRole || !tenantAgentRole) {
        console.warn('  ⚠️  Rôles RBAC introuvables : aucun membership créé.');
        console.warn('     Lancez `npm run db:seed:rbac` puis relancez ce seed.');
    } else {
        const assignments = [
            { user: admin1, tenant: tenant1, role: tenantAdminRole },
            { user: admin2, tenant: tenant2, role: tenantAdminRole },
            { user: collaborator, tenant: tenant1, role: tenantAgentRole }
        ];

        for (const { user, tenant, role } of assignments) {
            await prisma.membership.create({
                data: {
                    userId: user.id,
                    tenantId: tenant.id,
                    status: MembershipStatus.ACTIVE,
                    acceptedAt: new Date()
                }
            });

            await prisma.userRole.create({
                data: {
                    userId: user.id,
                    roleId: role.id,
                    tenantId: tenant.id
                }
            });

            console.log(`  ✓ ${user.email} → ${tenant.slug} (${role.key})`);
        }
    }

    console.log('\n🏘️  Creating tenant clients...');

    // Create Propriétaire client for Tenant 1
    await prisma.tenantClient.create({
        data: {
            userId: proprietaire.id,
            tenantId: tenant1.id,
            clientType: ClientType.OWNER,
            details: {
                propertyCount: 3,
                totalValue: 150000000, // 150M FCFA
                locations: ['Bamako', 'Koulikoro'],
                preferredContact: 'phone'
            }
        }
    });
    console.log('  ✓ Propriétaire linked to Tenant 1 as OWNER');

    // Create Locataire client for Tenant 2
    await prisma.tenantClient.create({
        data: {
            userId: locataire.id,
            tenantId: tenant2.id,
            clientType: ClientType.RENTER,
            details: {
                budget: 75000, // 75K FCFA per month
                preferredLocation: 'Bamako, Hamdallaye',
                moveInDate: '2025-02-01',
                propertyType: 'apartment',
                bedrooms: 3,
                notes: 'Recherche appartement 3 chambres avec parking'
            }
        }
    });
    console.log('  ✓ Locataire linked to Tenant 2 as RENTER');

    console.log('\n✅ Database seeded successfully!\n');
    console.log('📋 Summary:');
    console.log('  • Tenants: 2 (Agence Mali, Bamako Immo)');
    console.log('  • Users: 6 total');
    console.log('    - 1 Visitor (not linked to any tenant)');
    console.log('    - 2 Admins (one per tenant)');
    console.log('    - 1 Agent (in Tenant 1)');
    console.log('    - 1 Propriétaire (Owner in Tenant 1)');
    console.log('    - 1 Locataire (Renter in Tenant 2)');
    console.log('\n🔑 Login Credentials (all users):');
    console.log('  Password: Test@123456\n');
    console.log('  Accounts:');
    console.log('  1. visitor@immobillier.com      - Visitor (no tenant)');
    console.log('  2. admin1@agence-mali.com       - TENANT_ADMIN @ Agence Mali');
    console.log('  3. admin2@bamako-immo.com       - TENANT_ADMIN @ Bamako Immo');
    console.log('  4. agent@agence-mali.com        - TENANT_AGENT @ Agence Mali');
    console.log('  5. proprietaire@gmail.com       - Owner client @ Agence Mali');
    console.log('  6. locataire@gmail.com          - Renter client @ Bamako Immo');
    console.log('');
}

main()
    .catch((e) => {
        console.error('❌ Error seeding database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

