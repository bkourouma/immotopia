import { PrismaClient, MembershipStatus } from '@prisma/client';
import { assertNotProduction } from './assert-not-production';

const prisma = new PrismaClient();

async function main() {
  assertNotProduction('fix-amadou-kone.ts');
  console.log("🔍 Vérification de la situation d'Amadou Koné...\n");

  // Trouver l'utilisateur Amadou Koné
  const user = await prisma.user.findUnique({
    where: { email: 'admin1@agence-mali.com' },
    include: {
      memberships: {
        include: {
          tenant: true
        }
      },
      userRoles: {
        include: {
          role: true
        }
      }
    }
  });

  if (!user) {
    console.error('❌ Utilisateur Amadou Koné (admin1@agence-mali.com) introuvable!');
    console.log("💡 Exécutez d'abord le seed principal: npm run prisma:seed");
    process.exit(1);
  }

  console.log(`✅ Utilisateur trouvé: ${user.fullName} (${user.email})`);
  console.log(`   - ID: ${user.id}`);
  console.log(`   - Global Role: ${user.globalRole}`);
  console.log(`   - Active: ${user.isActive}`);
  console.log(`   - Email Verified: ${user.emailVerified}\n`);

  // Trouver le tenant "Agence Immobilière du Mali"
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ slug: 'agence-mali' }, { name: { contains: 'Agence Immobilière du Mali', mode: 'insensitive' } }]
    }
  });

  if (!tenant) {
    console.error('❌ Tenant "Agence Immobilière du Mali" introuvable!');
    process.exit(1);
  }

  console.log(`✅ Tenant trouvé: ${tenant.name} (${tenant.id})`);
  console.log(`   - Slug: ${tenant.slug}\n`);

  // Vérifier la membership
  let membership = user.memberships.find((m: any) => m.tenantId === tenant.id);

  if (!membership) {
    console.log('⚠️  Aucune membership trouvée. Création...');
    membership = await prisma.membership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        status: MembershipStatus.ACTIVE,
        acceptedAt: new Date(),
        createdAt: new Date()
      },
      include: {
        tenant: true
      }
    });
    console.log('✅ Membership créée avec succès!\n');
  } else {
    console.log(`✅ Membership trouvée: ${membership.id}`);
    console.log(`   - Status: ${membership.status}`);
    console.log(`   - Created: ${membership.createdAt}\n`);

    // Activer la membership si elle n'est pas active
    if (membership.status !== MembershipStatus.ACTIVE) {
      console.log("⚠️  Membership n'est pas ACTIVE. Activation...");
      membership = await prisma.membership.update({
        where: { id: membership.id },
        data: {
          status: MembershipStatus.ACTIVE,
          acceptedAt: membership.acceptedAt || new Date()
        },
        include: {
          tenant: true
        }
      });
      console.log('✅ Membership activée!\n');
    }
  }

  // Vérifier les rôles RBAC (userRoles sont sur User, pas Membership)
  const tenantRoles = user.userRoles.filter((ur: any) => ur.tenantId === tenant.id && ur.role.scope === 'TENANT');

  console.log(`📋 Rôles RBAC actuels: ${tenantRoles.length}`);
  tenantRoles.forEach((ur: any) => {
    console.log(`   - ${ur.role.key} (${ur.role.name})`);
  });

  // Vérifier si TENANT_ADMIN existe
  const tenantAdminRole = await prisma.role.findUnique({
    where: { key: 'TENANT_ADMIN' }
  });

  if (!tenantAdminRole) {
    console.error('\n❌ Rôle TENANT_ADMIN introuvable!');
    console.log("💡 Exécutez d'abord le seed RBAC: npx ts-node prisma/seeds/rbac-seed.ts");
    process.exit(1);
  }

  // Vérifier si l'utilisateur a déjà TENANT_ADMIN
  const hasTenantAdmin = tenantRoles.some((ur: any) => ur.role.key === 'TENANT_ADMIN');

  if (!hasTenantAdmin) {
    console.log('\n⚠️  Rôle TENANT_ADMIN manquant. Attribution...');

    // Supprimer les anciens rôles tenant pour éviter les conflits
    await prisma.userRole.deleteMany({
      where: {
        userId: user.id,
        tenantId: tenant.id
      }
    });

    // Assigner TENANT_ADMIN
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: tenantAdminRole.id,
        tenantId: tenant.id
      }
    });
    console.log('✅ Rôle TENANT_ADMIN assigné avec succès!\n');
  } else {
    console.log('\n✅ Rôle TENANT_ADMIN déjà assigné!\n');
  }

  // Vérification finale
  const finalUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      memberships: {
        where: { tenantId: tenant.id },
        include: { tenant: true }
      },
      userRoles: {
        where: { tenantId: tenant.id },
        include: { role: true }
      }
    }
  });

  const finalMembership = finalUser?.memberships[0];
  const finalRoles = finalUser?.userRoles.filter((ur: any) => ur.role.scope === 'TENANT') || [];

  console.log('📊 Situation finale:');
  console.log(`   - Membership: ${finalMembership?.status || 'N/A'}`);
  console.log(`   - Rôles tenant: ${finalRoles.length}`);
  finalRoles.forEach((ur: any) => {
    console.log(`     • ${ur.role.key}`);
  });
  console.log('\n✅ Amadou Koné est maintenant configuré correctement!');
  console.log('   Il devrait voir tous les menus du tenant.\n');
}

main()
  .catch(e => {
    console.error('❌ Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
