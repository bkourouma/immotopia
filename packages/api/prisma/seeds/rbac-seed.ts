import { PrismaClient, RoleScope } from '@prisma/client';
import { seedCRMPermissions } from './crm-permissions-seed';
import { seedPropertyPermissions } from './property-permissions-seed';
import { seedRentalPermissions } from './rental-permissions-seed';
import { seedMaintenancePermissions } from './maintenance-permissions-seed';
import { seedCommunicationPermissions } from './communication-permissions-seed';
import { seedFinancePermissions } from './finance-permissions-seed';
import { seedStockPermissions } from './stock-permissions-seed';
import { seedSiteManagerRole } from './site-manager-role-seed';
import { seedSyndicPermissions } from './syndic-permissions-seed';
import { seedAuditPermissions } from './audit-permissions-seed';

const prisma = new PrismaClient();

async function seedRBAC() {
  console.log('🔐 Seeding RBAC roles and permissions...');

  // First, seed CRM permissions
  await seedCRMPermissions();

  // Seed Property permissions
  await seedPropertyPermissions();

  // Seed Rental permissions
  await seedRentalPermissions();

  // Create permissions
  const permissions = [
    // Platform permissions
    { key: 'PLATFORM_TENANTS_VIEW', description: 'View all tenants' },
    { key: 'PLATFORM_TENANTS_CREATE', description: 'Create tenants' },
    { key: 'PLATFORM_TENANTS_EDIT', description: 'Edit tenants' },
    { key: 'PLATFORM_MODULES_VIEW', description: 'View tenant modules' },
    { key: 'PLATFORM_MODULES_EDIT', description: 'Edit tenant modules' },
    { key: 'PLATFORM_SUBSCRIPTIONS_VIEW', description: 'View subscriptions' },
    { key: 'PLATFORM_SUBSCRIPTIONS_EDIT', description: 'Edit subscriptions' },
    { key: 'PLATFORM_INVOICES_VIEW', description: 'View invoices' },
    { key: 'PLATFORM_INVOICES_CREATE', description: 'Create invoices' },
    { key: 'PLATFORM_INVOICES_EDIT', description: 'Edit invoices' },

    // Tenant permissions
    { key: 'TENANT_SETTINGS_VIEW', description: 'View tenant settings' },
    { key: 'TENANT_SETTINGS_EDIT', description: 'Edit tenant settings' },
    { key: 'USERS_VIEW', description: 'View collaborators' },
    { key: 'USERS_CREATE', description: 'Create collaborators' },
    { key: 'USERS_EDIT', description: 'Edit collaborators' },
    { key: 'USERS_DISABLE', description: 'Disable collaborators' },
    { key: 'BILLING_VIEW', description: 'View billing information' }
  ];

  console.log('  Creating permissions...');
  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: {},
      create: perm
    });
  }
  console.log(`  ✓ Created ${permissions.length} permissions`);

  // Create roles
  console.log('  Creating roles...');

  const platformSuperAdmin = await prisma.role.upsert({
    where: { key: 'PLATFORM_SUPER_ADMIN' },
    update: {},
    create: {
      key: 'PLATFORM_SUPER_ADMIN',
      name: 'Platform Super Admin',
      description: 'Full platform access with all permissions',
      scope: RoleScope.PLATFORM
    }
  });
  console.log('  ✓ Created PLATFORM_SUPER_ADMIN role');

  const tenantAdmin = await prisma.role.upsert({
    where: { key: 'TENANT_ADMIN' },
    update: {},
    create: {
      key: 'TENANT_ADMIN',
      name: 'Tenant Admin',
      description: 'Full tenant management including users and settings',
      scope: RoleScope.TENANT
    }
  });
  console.log('  ✓ Created TENANT_ADMIN role');

  const tenantManager = await prisma.role.upsert({
    where: { key: 'TENANT_MANAGER' },
    update: {},
    create: {
      key: 'TENANT_MANAGER',
      name: 'Tenant Manager',
      description: 'Management permissions without billing edit',
      scope: RoleScope.TENANT
    }
  });
  console.log('  ✓ Created TENANT_MANAGER role');

  const tenantAgent = await prisma.role.upsert({
    where: { key: 'TENANT_AGENT' },
    update: {},
    create: {
      key: 'TENANT_AGENT',
      name: 'Tenant Agent',
      description: 'Limited permissions for viewing and creating listings',
      scope: RoleScope.TENANT
    }
  });
  console.log('  ✓ Created TENANT_AGENT role');

  const tenantAccountant = await prisma.role.upsert({
    where: { key: 'TENANT_ACCOUNTANT' },
    update: {},
    create: {
      key: 'TENANT_ACCOUNTANT',
      name: 'Tenant Accountant',
      description: 'Billing and accounting permissions',
      scope: RoleScope.TENANT
    }
  });
  console.log('  ✓ Created TENANT_ACCOUNTANT role');

  // Seed Maintenance, Communication and Finance permissions: they assign their
  // permissions to existing roles, so they must run after the roles above are
  // created and before the PLATFORM_SUPER_ADMIN assignment below.
  await seedMaintenancePermissions();
  await seedCommunicationPermissions();
  await seedFinancePermissions();
  // Lot 040 : droits du stock et role Magasinier, juste apres les droits
  // financiers et avant l'attribution de tout au PLATFORM_SUPER_ADMIN.
  await seedStockPermissions();
  // Lot 041 : role Chef de chantier (STOCK_COUNT seul), apres les droits du stock.
  await seedSiteManagerRole();
  await seedSyndicPermissions();

  // Journal d'activite de l'agence (ADR-006) : cree la permission AVANT que
  // TENANT_ADMIN ne recoive ses droits `TENANT_*` ci-dessous.
  await seedAuditPermissions();

  // Assign all permissions to PLATFORM_SUPER_ADMIN
  console.log('  Assigning permissions to PLATFORM_SUPER_ADMIN...');
  const allPerms = await prisma.permission.findMany();
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: platformSuperAdmin.id,
          permissionId: perm.id
        }
      },
      update: {},
      create: {
        roleId: platformSuperAdmin.id,
        permissionId: perm.id
      }
    });
  }
  console.log(`  ✓ Assigned ${allPerms.length} permissions to PLATFORM_SUPER_ADMIN`);

  // Assign tenant permissions to TENANT_ADMIN
  console.log('  Assigning permissions to TENANT_ADMIN...');
  const tenantPerms = await prisma.permission.findMany({
    where: {
      key: {
        startsWith: 'TENANT_'
      }
    }
  });
  const userPerms = await prisma.permission.findMany({
    where: {
      key: {
        startsWith: 'USERS_'
      }
    }
  });
  const billingPerms = await prisma.permission.findMany({
    where: {
      key: {
        startsWith: 'BILLING_'
      }
    }
  });
  const crmPerms = await prisma.permission.findMany({
    where: {
      key: {
        startsWith: 'CRM_'
      }
    }
  });
  const propertyPerms = await prisma.permission.findMany({
    where: {
      key: {
        startsWith: 'PROPERTIES_'
      }
    }
  });
  const rentalPerms = await prisma.permission.findMany({
    where: {
      key: {
        startsWith: 'RENTAL_'
      }
    }
  });

  const tenantAdminPerms = [
    ...tenantPerms,
    ...userPerms,
    ...billingPerms,
    ...crmPerms,
    ...propertyPerms,
    ...rentalPerms
  ];
  for (const perm of tenantAdminPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: tenantAdmin.id,
          permissionId: perm.id
        }
      },
      update: {},
      create: {
        roleId: tenantAdmin.id,
        permissionId: perm.id
      }
    });
  }
  console.log(`  ✓ Assigned ${tenantAdminPerms.length} permissions to TENANT_ADMIN`);

  // Assign limited permissions to TENANT_MANAGER
  console.log('  Assigning permissions to TENANT_MANAGER...');
  const managerPerms = await prisma.permission.findMany({
    where: {
      key: {
        in: ['TENANT_SETTINGS_VIEW', 'USERS_VIEW', 'USERS_EDIT', 'BILLING_VIEW']
      }
    }
  });
  // Add property permissions to manager
  const managerPropertyPerms = await prisma.permission.findMany({
    where: {
      key: {
        in: ['PROPERTIES_VIEW', 'PROPERTIES_CREATE', 'PROPERTIES_EDIT', 'PROPERTIES_VISITS_SCHEDULE']
      }
    }
  });
  // Add rental permissions to manager (all rental permissions)
  const managerRentalPerms = await prisma.permission.findMany({
    where: {
      key: {
        startsWith: 'RENTAL_'
      }
    }
  });
  // Add CRM permissions to manager (all CRM permissions)
  const managerCRMPerms = await prisma.permission.findMany({
    where: {
      key: {
        startsWith: 'CRM_'
      }
    }
  });
  const allManagerPerms = [...managerPerms, ...managerPropertyPerms, ...managerRentalPerms, ...managerCRMPerms];
  for (const perm of allManagerPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: tenantManager.id,
          permissionId: perm.id
        }
      },
      update: {},
      create: {
        roleId: tenantManager.id,
        permissionId: perm.id
      }
    });
  }
  console.log(`  ✓ Assigned ${allManagerPerms.length} permissions to TENANT_MANAGER`);

  // Assign view permissions to TENANT_AGENT
  console.log('  Assigning permissions to TENANT_AGENT...');
  const agentPerms = await prisma.permission.findMany({
    where: {
      key: {
        in: ['TENANT_SETTINGS_VIEW'] // USERS_VIEW retire (BUG-096) : liste des collaborateurs hors perimetre Agent
      }
    }
  });
  // Add property view, create, and edit permissions to agent
  const agentPropertyPerms = await prisma.permission.findMany({
    where: {
      key: {
        in: ['PROPERTIES_VIEW', 'PROPERTIES_CREATE', 'PROPERTIES_EDIT', 'PROPERTIES_VISITS_SCHEDULE']
      }
    }
  });
  // Add CRM permissions to agent (view and create permissions)
  const agentCRMPerms = await prisma.permission.findMany({
    where: {
      key: {
        in: [
          'CRM_CONTACTS_VIEW',
          'CRM_CONTACTS_CREATE',
          'CRM_CONTACTS_EDIT',
          'CRM_DEALS_VIEW',
          'CRM_DEALS_CREATE',
          'CRM_DEALS_EDIT',
          'CRM_ACTIVITIES_VIEW',
          'CRM_ACTIVITIES_CREATE',
          'CRM_APPOINTMENTS_VIEW',
          'CRM_APPOINTMENTS_CREATE',
          'CRM_MATCHING_VIEW'
        ]
      }
    }
  });
  const allAgentPerms = [...agentPerms, ...agentPropertyPerms, ...agentCRMPerms];
  for (const perm of allAgentPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: tenantAgent.id,
          permissionId: perm.id
        }
      },
      update: {},
      create: {
        roleId: tenantAgent.id,
        permissionId: perm.id
      }
    });
  }
  console.log(`  ✓ Assigned ${allAgentPerms.length} permissions to TENANT_AGENT`);

  // Assign billing permissions to TENANT_ACCOUNTANT
  console.log('  Assigning permissions to TENANT_ACCOUNTANT...');
  for (const perm of billingPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: tenantAccountant.id,
          permissionId: perm.id
        }
      },
      update: {},
      create: {
        roleId: tenantAccountant.id,
        permissionId: perm.id
      }
    });
  }
  console.log(`  ✓ Assigned ${billingPerms.length} permissions to TENANT_ACCOUNTANT`);

  console.log('\n✅ RBAC seed completed successfully!\n');
  console.log('📋 Summary:');
  console.log(`  • Permissions: ${permissions.length}`);
  console.log('  • Roles: 5');
  console.log('    - PLATFORM_SUPER_ADMIN (all permissions)');
  console.log('    - TENANT_ADMIN (tenant management)');
  console.log('    - TENANT_MANAGER (limited management)');
  console.log('    - TENANT_AGENT (view only)');
  console.log('    - TENANT_ACCOUNTANT (billing)');
  console.log('');
}

seedRBAC()
  .catch(e => {
    console.error('❌ Error seeding RBAC:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
