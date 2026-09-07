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
  console.log('🚀 Création du tenant de test et du TenantClient...\n');

  try {
    // Générer le hash du mot de passe
    const passwordHash = await bcrypt.hash('password123', 10);
    console.log('✅ Hash du mot de passe généré');

    // Créer ou récupérer le tenant de test avec l'ID spécifique
    const tenant = await prisma.tenant.upsert({
      where: { id: 'test-tenant-id' },
      update: {
        name: 'Tenant de Test',
        slug: 'test-tenant',
        type: 'AGENCY',
        isActive: true,
        status: 'ACTIVE',
        updatedAt: new Date()
      },
      create: {
        id: 'test-tenant-id',
        name: 'Tenant de Test',
        slug: 'test-tenant',
        type: 'AGENCY',
        isActive: true,
        status: 'ACTIVE'
      }
    });

    console.log(`✅ Tenant créé/trouvé: ${tenant.name} (${tenant.id})\n`);

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

    // Vérifier si le TenantClient existe déjà avec cet ID
    let tenantClient = await prisma.tenantClient.findUnique({
      where: { id: 'test-tenant-client-id' }
    });

    if (tenantClient) {
      // Mettre à jour l'existant
      tenantClient = await prisma.tenantClient.update({
        where: { id: 'test-tenant-client-id' },
        data: {
          userId: user.id,
          tenantId: tenant.id,
          clientType: 'RENTER',
          updatedAt: new Date()
        }
      });
    } else {
      // Vérifier si une relation existe déjà entre cet utilisateur et ce tenant
      const existingRelation = await prisma.tenantClient.findUnique({
        where: {
          userId_tenantId: {
            userId: user.id,
            tenantId: tenant.id
          }
        }
      });

      if (existingRelation) {
        // Mettre à jour l'existant avec le nouvel ID
        tenantClient = await prisma.tenantClient.update({
          where: {
            userId_tenantId: {
              userId: user.id,
              tenantId: tenant.id
            }
          },
          data: {
            id: 'test-tenant-client-id',
            clientType: 'RENTER',
            updatedAt: new Date()
          }
        });
      } else {
        // Créer nouveau
        tenantClient = await prisma.tenantClient.create({
          data: {
            id: 'test-tenant-client-id',
            userId: user.id,
            tenantId: tenant.id,
            clientType: 'RENTER'
          }
        });
      }
    }

    console.log('✅ TenantClient créé/mis à jour:');
    console.log(`   - ID: ${tenantClient.id}`);
    console.log(`   - Type: ${tenantClient.clientType}`);
    console.log(`   - Tenant ID: ${tenantClient.tenantId}`);
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
      console.log(`  ${index + 1}. ${profile.clientType} @ ${profile.tenant.name} (ID: ${profile.tenant.id})`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🎉 Création terminée avec succès!');
    console.log('\n📝 Informations de connexion:');
    console.log('   Email: locataire@test.com');
    console.log('   Mot de passe: password123');
    console.log('\n📋 IDs créés:');
    console.log(`   - Tenant ID: test-tenant-id`);
    console.log(`   - User ID: test-tenant-user-id`);
    console.log(`   - TenantClient ID: test-tenant-client-id`);

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
