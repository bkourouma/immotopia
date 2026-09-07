import { PrismaClient, GlobalRole, MembershipStatus, TenantType, ClientType } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type QuickUser = {
  email: string;
  password: string;
  fullName: string;
  globalRole?: GlobalRole;
};

async function upsertUser(user: QuickUser) {
  const passwordHash = await bcrypt.hash(user.password, 10);
  return prisma.user.upsert({
    where: { email: user.email },
    update: {
      fullName: user.fullName,
      passwordHash,
      globalRole: user.globalRole ?? GlobalRole.USER,
      emailVerified: true,
      isActive: true
    },
    create: {
      email: user.email,
      passwordHash,
      fullName: user.fullName,
      globalRole: user.globalRole ?? GlobalRole.USER,
      emailVerified: true,
      isActive: true
    }
  });
}

async function ensureTenant(name: string, slug: string) {
  return prisma.tenant.upsert({
    where: { slug },
    update: { name, type: TenantType.AGENCY, status: 'ACTIVE', isActive: true },
    create: { name, slug, type: TenantType.AGENCY, status: 'ACTIVE', isActive: true }
  });
}

async function assignMembershipAndRole(
  userId: string,
  tenantId: string,
  roleKey: 'TENANT_ADMIN' | 'TENANT_AGENT'
) {
  await prisma.membership.upsert({
    where: {
      userId_tenantId: { userId, tenantId }
    },
    update: {
      status: MembershipStatus.ACTIVE,
      acceptedAt: new Date()
    },
    create: {
      userId,
      tenantId,
      status: MembershipStatus.ACTIVE,
      acceptedAt: new Date()
    }
  });

  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) {
    return false;
  }

  await prisma.userRole.deleteMany({
    where: { userId, tenantId }
  });

  await prisma.userRole.create({
    data: {
      userId,
      roleId: role.id,
      tenantId
    }
  });

  return true;
}

async function assignPlatformSuperAdminRole(userId: string) {
  const role = await prisma.role.findUnique({ where: { key: 'PLATFORM_SUPER_ADMIN' } });
  if (!role) {
    return false;
  }

  await prisma.userRole.deleteMany({
    where: {
      userId,
      tenantId: null,
      role: { scope: 'PLATFORM' }
    }
  });

  await prisma.userRole.create({
    data: {
      userId,
      roleId: role.id,
      tenantId: null
    }
  });

  return true;
}

async function upsertTenantClient(userId: string, tenantId: string, clientType: ClientType) {
  try {
    return await prisma.tenantClient.upsert({
      where: {
        userId_tenantId: { userId, tenantId }
      },
      update: { clientType },
      create: {
        userId,
        tenantId,
        clientType
      }
    });
  } catch (error: any) {
    console.log(`  WARN tenantClient skipped for user ${userId}: ${error?.code || 'unknown error'}`);
    return null;
  }
}

async function main() {
  console.log('Seeding quick-login users...');

  const agenceMali = await ensureTenant('Agence Immobiliere du Mali', 'agence-mali');
  const bamakoImmo = await ensureTenant('Bamako Immobilier', 'bamako-immo');

  const users: QuickUser[] = [
    {
      email: 'admin@immobillier.com',
      password: 'Admin@123456',
      fullName: 'Super Administrateur',
      globalRole: GlobalRole.SUPER_ADMIN
    },
    {
      email: 'visitor@immobillier.com',
      password: 'Test@123456',
      fullName: 'Visiteur Non Lie'
    },
    {
      email: 'scolarflow@gmail.com',
      password: 'Test@123456',
      fullName: 'Amadou Kone'
    },
    {
      email: 'admin2@bamako-immo.com',
      password: 'Test@123456',
      fullName: 'Fatima Traore'
    },
    {
      email: 'agent@agence-mali.com',
      password: 'Test@123456',
      fullName: 'Moussa Diarra'
    },
    {
      email: "collab7.koffi.n'guessan@agence-mali.com",
      password: 'Test@123456',
      fullName: "Koffi N'Guessan"
    },
    {
      email: 'mickael.andjui.21@gmail.com',
      password: 'P@ssw0rd_2025',
      fullName: 'DevMick Ange'
    },
    {
      email: 'bkourouma2002@yahoo.com',
      password: 'P@ssw0rd_2026',
      fullName: 'BABA KOUROUMA'
    },
    {
      email: 'devaccrocs@gmail.com',
      password: 'P@ssw0rd',
      fullName: 'Ali Sangare'
    }
  ];

  const created = new Map<string, string>();
  for (const user of users) {
    const record = await upsertUser(user);
    created.set(user.email, record.id);
    console.log(`  OK user: ${user.email}`);
  }

  // memberships + roles for tenant collaborators/admins
  await assignMembershipAndRole(created.get('scolarflow@gmail.com')!, agenceMali.id, 'TENANT_ADMIN');
  await assignMembershipAndRole(created.get('agent@agence-mali.com')!, agenceMali.id, 'TENANT_AGENT');
  await assignMembershipAndRole(created.get("collab7.koffi.n'guessan@agence-mali.com")!, agenceMali.id, 'TENANT_AGENT');
  await assignMembershipAndRole(created.get('admin2@bamako-immo.com')!, bamakoImmo.id, 'TENANT_ADMIN');

  // optional platform role assignment (if RBAC role exists)
  const platformRoleAssigned = await assignPlatformSuperAdminRole(created.get('admin@immobillier.com')!);
  if (!platformRoleAssigned) {
    console.log('  WARN role PLATFORM_SUPER_ADMIN introuvable (globalRole SUPER_ADMIN est bien applique).');
  }

  // client profiles for quick-login client accounts
  await upsertTenantClient(created.get('mickael.andjui.21@gmail.com')!, agenceMali.id, ClientType.OWNER);
  await upsertTenantClient(created.get('bkourouma2002@yahoo.com')!, bamakoImmo.id, ClientType.RENTER);
  await upsertTenantClient(created.get('devaccrocs@gmail.com')!, agenceMali.id, ClientType.RENTER);

  console.log('\nDone. Quick-login accounts are now present in database.');
}

main()
  .catch((e) => {
    console.error('Error while seeding quick-login users:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
