import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Script to list all tenants with their information, modules, users and roles
 * Usage: 
 *   ts-node prisma/seeds/list-all-tenants.ts
 */
async function main() {
  console.log('📋 Récupération de tous les tenants et leurs informations...\n');

  // Get all tenants with their modules, subscription, memberships, and clients
  const tenants = await prisma.tenant.findMany({
    include: {
      modules: {
        where: { enabled: true },
        select: {
          moduleKey: true,
          enabledAt: true
        }
      },
      subscription: {
        select: {
          planKey: true,
          status: true,
          billingCycle: true
        }
      },
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              globalRole: true,
              isActive: true,
              userRoles: {
                where: {
                  tenantId: { not: null }
                },
                include: {
                  role: {
                    select: {
                      key: true,
                      name: true,
                      scope: true,
                      description: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      },
      clients: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              isActive: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  if (tenants.length === 0) {
    console.log('⚠️  Aucun tenant trouvé dans la base de données.\n');
    return;
  }

  console.log(`✅ Trouvé ${tenants.length} tenant(s) dans la base de données\n`);
  console.log('═'.repeat(100));
  console.log('\n');

  // Get all roles in the system
  const allRoles = await prisma.role.findMany({
    orderBy: { key: 'asc' },
    select: {
      id: true,
      key: true,
      name: true,
      scope: true,
      description: true
    }
  });

  console.log('📊 RÔLES DISPONIBLES DANS LE SYSTÈME:');
  console.log('─'.repeat(100));
  
  const platformRoles = allRoles.filter(r => r.scope === 'PLATFORM');
  const tenantRoles = allRoles.filter(r => r.scope === 'TENANT');

  if (platformRoles.length > 0) {
    console.log('\n🌐 Rôles PLATFORM:');
    platformRoles.forEach(role => {
      console.log(`   • ${role.key} - ${role.name}`);
      if (role.description) {
        console.log(`     ${role.description}`);
      }
    });
  }

  if (tenantRoles.length > 0) {
    console.log('\n🏢 Rôles TENANT:');
    tenantRoles.forEach(role => {
      console.log(`   • ${role.key} - ${role.name}`);
      if (role.description) {
        console.log(`     ${role.description}`);
      }
    });
  }

  console.log('\n');
  console.log('═'.repeat(100));
  console.log('\n');

  // Display each tenant
  for (const tenant of tenants) {
    console.log(`\n🏢 TENANT: ${tenant.name}`);
    console.log('─'.repeat(100));
    console.log(`   ID: ${tenant.id}`);
    console.log(`   Slug: ${tenant.slug}`);
    console.log(`   Type: ${tenant.type}`);
    console.log(`   Statut: ${tenant.status}`);
    console.log(`   Actif: ${tenant.isActive ? '✅' : '❌'}`);
    
    if (tenant.legalName) {
      console.log(`   Nom légal: ${tenant.legalName}`);
    }
    if (tenant.contactEmail) {
      console.log(`   Email: ${tenant.contactEmail}`);
    }
    if (tenant.contactPhone) {
      console.log(`   Téléphone: ${tenant.contactPhone}`);
    }
    if (tenant.country || tenant.city) {
      console.log(`   Localisation: ${[tenant.country, tenant.city].filter(Boolean).join(', ')}`);
    }
    if (tenant.subdomain) {
      console.log(`   Sous-domaine: ${tenant.subdomain}`);
    }
    if (tenant.customDomain) {
      console.log(`   Domaine personnalisé: ${tenant.customDomain}`);
    }
    console.log(`   Créé le: ${tenant.createdAt.toLocaleString('fr-FR')}`);

    // Modules activés
    if (tenant.modules.length > 0) {
      console.log(`\n   📦 Modules activés (${tenant.modules.length}):`);
      tenant.modules.forEach(module => {
        console.log(`      • ${module.moduleKey} (activé le ${module.enabledAt?.toLocaleString('fr-FR') || 'N/A'})`);
      });
    } else {
      console.log(`\n   📦 Modules activés: Aucun`);
    }

    // Subscription
    if (tenant.subscription) {
      console.log(`\n   💳 Abonnement:`);
      console.log(`      Plan: ${tenant.subscription.planKey}`);
      console.log(`      Statut: ${tenant.subscription.status}`);
      console.log(`      Cycle de facturation: ${tenant.subscription.billingCycle}`);
    } else {
      console.log(`\n   💳 Abonnement: Aucun`);
    }

    // Members (users) and their roles
    if (tenant.memberships.length > 0) {
      console.log(`\n   👥 Membres/Collaborateurs (${tenant.memberships.length}):`);
      tenant.memberships.forEach(membership => {
        const user = membership.user;
        const tenantUserRoles = user.userRoles.filter(ur => ur.role.scope === 'TENANT');
        
        console.log(`\n      👤 ${user.fullName || 'N/A'} (${user.email})`);
        console.log(`         ID: ${user.id}`);
        console.log(`         Rôle global: ${user.globalRole}`);
        console.log(`         Statut membre: ${membership.status}`);
        console.log(`         Utilisateur actif: ${user.isActive ? '✅' : '❌'}`);
        
        if (tenantUserRoles.length > 0) {
          console.log(`         Rôles tenant (${tenantUserRoles.length}):`);
          tenantUserRoles.forEach(userRole => {
            console.log(`            • ${userRole.role.name} (${userRole.role.key})`);
          });
        } else {
          console.log(`         Rôles tenant: ❌ Aucun rôle assigné`);
        }
      });
    } else {
      console.log(`\n   👥 Membres/Collaborateurs: Aucun membre`);
    }

    // Clients (Owners, Renters, Buyers)
    if (tenant.clients.length > 0) {
      const owners = tenant.clients.filter(c => c.clientType === 'OWNER');
      const renters = tenant.clients.filter(c => c.clientType === 'RENTER');
      const buyers = tenant.clients.filter(c => c.clientType === 'BUYER');
      const coOwners = tenant.clients.filter(c => c.clientType === 'CO_OWNER');

      console.log(`\n   👥 Clients (${tenant.clients.length}):`);
      
      if (owners.length > 0) {
        console.log(`\n      🏠 Propriétaires (OWNER) - ${owners.length}:`);
        owners.forEach(client => {
          const user = client.user;
          console.log(`         • ${user.fullName || 'N/A'} (${user.email})`);
          console.log(`           Portail propriétaire: ${client.ownerPortalEnabled ? '✅ Activé' : '❌ Désactivé'}`);
          if (client.ownerPortalLastAccess) {
            console.log(`           Dernière connexion: ${client.ownerPortalLastAccess.toLocaleString('fr-FR')}`);
          }
        });
      }

      if (renters.length > 0) {
        console.log(`\n      🏡 Locataires (RENTER) - ${renters.length}:`);
        renters.forEach(client => {
          const user = client.user;
          console.log(`         • ${user.fullName || 'N/A'} (${user.email})`);
        });
      }

      if (buyers.length > 0) {
        console.log(`\n      💰 Acquéreurs (BUYER) - ${buyers.length}:`);
        buyers.forEach(client => {
          const user = client.user;
          console.log(`         • ${user.fullName || 'N/A'} (${user.email})`);
        });
      }

      if (coOwners.length > 0) {
        console.log(`\n      🤝 Co-propriétaires (CO_OWNER) - ${coOwners.length}:`);
        coOwners.forEach(client => {
          const user = client.user;
          console.log(`         • ${user.fullName || 'N/A'} (${user.email})`);
        });
      }
    } else {
      console.log(`\n   👥 Clients: Aucun client (propriétaire/locataire)`);
    }

    console.log('\n');
  }

  console.log('═'.repeat(100));
  console.log('\n✅ Récupération terminée\n');
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
