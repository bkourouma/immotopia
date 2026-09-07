const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://postgres:DevMick@2003@localhost:5432/immotopia?schema=public'
    }
  }
});

async function main() {
  console.log('🚀 Création de l\'utilisateur et du TenantClient...\n');

  try {
    // Générer le hash du mot de passe
    const passwordHash = await bcrypt.hash('password123', 10);
    console.log('✅ Hash du mot de passe généré');

    // Vérifier si un tenant actif existe
    const tenant = await prisma.tenant.findFirst({
      where: {
        isActive: true
      }
    });

    if (!tenant) {
      console.error('❌ Aucun tenant actif trouvé dans la base de données.');
      console.log('💡 Veuillez d\'abord créer un tenant ou exécuter le seed.');
      process.exit(1);
    }

    console.log(`📋 Tenant trouvé: ${tenant.name} (${tenant.id})\n`);

    // Créer ou mettre à jour l'utilisateur
    const user = await prisma.user.upsert({
      where: { id: 'test-tenant-user-id' },
      update: {
        email: 'locataire@test.com',
        passwordHash,
        fullName: 'Amadou Diallo',
        globalRole: 'USER',
        emailVerified: true,
        isActive: true,
        updatedAt: new Date()
      },
      create: {
        id: 'test-tenant-user-id',
        email: 'locataire@test.com',
        passwordHash,
        fullName: 'Amadou Diallo',
        globalRole: 'USER',
        emailVerified: true,
        isActive: true
      }
    });

    console.log('✅ Utilisateur créé/mis à jour:');
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Nom: ${user.fullName}`);
    console.log(`   - Rôle: ${user.globalRole}\n`);

    // Créer ou mettre à jour le TenantClient
    const tenantClient = await prisma.tenantClient.upsert({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: tenant.id
        }
      },
      update: {
        clientType: 'RENTER',
        updatedAt: new Date()
      },
      create: {
        id: 'test-tenant-client-id',
        userId: user.id,
        tenantId: tenant.id,
        clientType: 'RENTER'
      }
    });

    console.log('✅ TenantClient créé/mis à jour:');
    console.log(`   - ID: ${tenantClient.id}`);
    console.log(`   - Type: ${tenantClient.clientType}`);
    console.log(`   - Tenant: ${tenant.name}\n`);

    // Vérification finale
    const verification = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        clientProfiles: {
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            }
          }
        }
      }
    });

    console.log('📊 Vérification finale:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Utilisateur: ${verification.fullName}`);
    console.log(`Email: ${verification.email}`);
    console.log(`Email vérifié: ${verification.emailVerified ? '✅' : '❌'}`);
    console.log(`Compte actif: ${verification.isActive ? '✅' : '❌'}`);
    console.log(`\nProfils client:`);
    verification.clientProfiles.forEach((profile, index) => {
      console.log(`  ${index + 1}. ${profile.clientType} @ ${profile.tenant.name}`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🎉 Création terminée avec succès!');
    console.log('\n📝 Informations de connexion:');
    console.log('   Email: locataire@test.com');
    console.log('   Mot de passe: password123');

  } catch (error) {
    console.error('❌ Erreur lors de la création:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
  });
