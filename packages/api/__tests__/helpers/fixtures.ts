/**
 * Fabriques pour E1 (isolation bout en bout, base dediee) — lot E,
 * multi-tenant.
 *
 * Reutilise le client Prisma partage (`src/utils/database.ts`, avec le
 * garde-fou d'agence deja branche) plutot qu'un second client : les fabriques
 * tournent HORS contexte de requete (pas d'AsyncLocalStorage actif), donc le
 * garde-fou les laisse passer quel que soit `TENANT_GUARD_MODE` — voir
 * `utils/prisma-tenant-guard-extension.ts`.
 *
 * `DATABASE_URL`/`DATABASE_URL_TEST` : voir `__tests__/integration/isolation.test.ts`
 * pour la resolution de la base et le describe.skip quand elle est absente.
 */

import { randomUUID } from 'crypto';
import { MembershipStatus, RoleScope, TenantStatus, PropertyOwnershipType, PropertyType } from '@prisma/client';
import { prisma } from '../../src/utils/database';
import { generateAccessToken } from '../../src/utils/jwt-utils';

/**
 * Permissions accordees au role TENANT_ADMIN de test. Limitee aux ressources
 * couvertes par `__tests__/integration/isolation.test.ts` : etendre cette
 * liste est le seul geste necessaire pour ajouter une ressource testee (avec
 * une ligne dans le tableau `RESOURCES` du fichier de test).
 */
const TENANT_ADMIN_TEST_PERMISSIONS = [
  'CRM_CONTACTS_VIEW',
  'CRM_CONTACTS_EDIT',
  'CRM_DEALS_VIEW',
  'CRM_DEALS_CREATE',
  'PROPERTIES_VIEW',
  'PROPERTIES_EDIT',
  'SYNDIC_VIEW',
  // Ecriture Syndic (BUG-096) : les routes POST des quittances l'exigent ; sans
  // lui les tests d'isolation recevaient 403 au lieu de 404.
  'SYNDIC_EDIT',
  'MAINTENANCE_ADMIN',
  // Espace particulier : montee de palier (lot 4D).
  'TENANT_SETTINGS_VIEW',
  'TENANT_SETTINGS_EDIT',
  // ImmoCopilot : lecture des baux/documents, generation. Accordees des la
  // creation du role : `getUserPermissions` met les droits en cache 5 minutes
  // par utilisateur, un octroi tardif ne serait pas vu.
  'RENTAL_LEASES_VIEW',
  'RENTAL_DOCUMENTS_VIEW',
  'RENTAL_DOCUMENTS_GENERATE',
  // Journal d'activite de l'agence (ADR-006) : octroye des la creation du role.
  'TENANT_AUDIT_VIEW'
] as const;

let tenantAdminRoleId: string | null = null;

/** Cree (ou reutilise) le role TENANT_ADMIN de test avec les permissions ci-dessus. Idempotent. */
export async function ensureTenantAdminRole(): Promise<string> {
  if (tenantAdminRoleId) {
    return tenantAdminRoleId;
  }

  const role = await prisma.role.upsert({
    where: { key: 'TENANT_ADMIN' },
    update: {},
    create: {
      key: 'TENANT_ADMIN',
      name: 'Tenant Admin',
      description: 'Role TENANT_ADMIN (reutilise ou cree par les fixtures du lot E)',
      scope: RoleScope.TENANT
    }
  });

  for (const key of TENANT_ADMIN_TEST_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: `Permission de test (lot E) : ${key}` }
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id }
    });
  }

  tenantAdminRoleId = role.id;
  return role.id;
}

export interface TestTenant {
  id: string;
  slug: string;
}

export interface TestUser {
  id: string;
  email: string;
  /** En-tete pret a l'emploi : `.set('Authorization', user.authHeader)`. */
  authHeader: string;
}

/** Cree une agence ACTIVE, nom/slug uniques (suffixe aleatoire). */
export async function createTestTenant(namePrefix: string): Promise<TestTenant> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: {
      name: `${namePrefix} ${suffix}`,
      slug: `${namePrefix.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`,
      type: 'AGENCY',
      status: TenantStatus.ACTIVE
    }
  });
  return { id: tenant.id, slug: tenant.slug };
}

/**
 * Espace PARTICULIER ACTIF sur le palier gratuit (lot 4) : abonnement ACTIVE
 * mensuel, quota BLOCK, un element PARTICULIER_GRATUIT (le catalogue vient des
 * migrations). `phone: null` : aucun telephone (refus PHONE_REQUIRED).
 */
export async function createParticulierTenant(
  namePrefix: string,
  options: { phone?: string | null } = {}
): Promise<TestTenant> {
  const suffix = randomUUID().slice(0, 8);
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const catalog = await prisma.catalogItem.findUniqueOrThrow({ where: { code: 'PARTICULIER_GRATUIT' } });
  const tenant = await prisma.tenant.create({
    data: {
      name: `${namePrefix} ${suffix}`,
      slug: `${namePrefix.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`,
      type: 'PARTICULIER',
      status: TenantStatus.ACTIVE,
      contactPhone: options.phone === undefined ? '+2250102030405' : options.phone
    }
  });
  const subscription = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      billingCycle: 'MONTHLY',
      status: 'ACTIVE',
      startAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: end,
      nextBillingAt: end,
      quotaPolicy: 'BLOCK'
    }
  });
  await prisma.subscriptionItem.create({
    data: {
      subscriptionId: subscription.id,
      tenantId: tenant.id,
      catalogItemId: catalog.id,
      quantity: 1,
      unitMonthlyPrice: 0,
      status: 'ACTIVE',
      startsAt: now
    }
  });
  return { id: tenant.id, slug: tenant.slug };
}

/**
 * Cree un utilisateur, membre ACTIF de `tenant` avec le role TENANT_ADMIN de
 * test, et un jeton d'acces valide (memes utilitaires que la vraie
 * authentification — `utils/jwt-utils.ts`).
 */
export async function createTenantAdminUser(tenant: TestTenant, emailPrefix: string): Promise<TestUser> {
  const roleId = await ensureTenantAdminRole();
  const suffix = randomUUID().slice(0, 8);
  const email = `${emailPrefix}-${suffix}@isolation-test.local`;

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      fullName: `${emailPrefix} (test isolation)`,
      globalRole: 'USER',
      emailVerified: true,
      isActive: true
    }
  });

  await prisma.membership.create({
    data: { userId: user.id, tenantId: tenant.id, status: MembershipStatus.ACTIVE, acceptedAt: new Date() }
  });

  await prisma.userRole.create({
    data: { userId: user.id, roleId, tenantId: tenant.id }
  });

  const accessToken = generateAccessToken({ userId: user.id, email: user.email, globalRole: user.globalRole });

  return { id: user.id, email, authHeader: `Bearer ${accessToken}` };
}

/**
 * Cree un utilisateur, membre ACTIF de `tenant`, avec un role d'agence qui NE
 * porte PAS le droit d'administrateur : sert a verifier qu'un membre sans le
 * droit requis est refuse. Le role (cle `roleKey`) est cree s'il manque, avec
 * exactement `permissionKeys`.
 */
export async function createTenantMemberUser(
  tenant: TestTenant,
  emailPrefix: string,
  roleKey: string,
  permissionKeys: string[]
): Promise<TestUser> {
  const role = await prisma.role.upsert({
    where: { key: roleKey },
    update: {},
    create: { key: roleKey, name: roleKey, description: `Role de test (${roleKey})`, scope: RoleScope.TENANT }
  });
  for (const key of permissionKeys) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: `Permission de test : ${key}` }
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id }
    });
  }

  const email = `${emailPrefix}-${randomUUID().slice(0, 8)}@isolation-test.local`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      fullName: `${emailPrefix} (test isolation)`,
      globalRole: 'USER',
      emailVerified: true,
      isActive: true
    }
  });
  await prisma.membership.create({
    data: { userId: user.id, tenantId: tenant.id, status: MembershipStatus.ACTIVE, acceptedAt: new Date() }
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, tenantId: tenant.id } });

  const accessToken = generateAccessToken({ userId: user.id, email: user.email, globalRole: user.globalRole });
  return { id: user.id, email, authHeader: `Bearer ${accessToken}` };
}

/** Super-administrateur actif de la plateforme (`globalRole = SUPER_ADMIN`), avec un jeton d'acces valide. */
export async function createSuperAdminUser(emailPrefix: string): Promise<TestUser> {
  const email = `${emailPrefix}-${randomUUID().slice(0, 8)}@isolation-test.local`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      fullName: `${emailPrefix} (test isolation)`,
      globalRole: 'SUPER_ADMIN',
      emailVerified: true,
      isActive: true
    }
  });
  const accessToken = generateAccessToken({ userId: user.id, email: user.email, globalRole: user.globalRole });
  return { id: user.id, email, authHeader: `Bearer ${accessToken}` };
}

/**
 * Utilisateur ordinaire portant un role PLATEFORME delegue (sans etre
 * super-admin) avec exactement `permissionKeys` : sert a verifier ce qu'un role
 * delegue peut et ne peut pas faire.
 */
export async function createPlatformDelegateUser(
  emailPrefix: string,
  roleKey: string,
  permissionKeys: string[]
): Promise<TestUser> {
  const role = await prisma.role.upsert({
    where: { key: roleKey },
    update: {},
    create: {
      key: roleKey,
      name: roleKey,
      description: `Role plateforme de test (${roleKey})`,
      scope: RoleScope.PLATFORM
    }
  });
  for (const key of permissionKeys) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: `Permission de test : ${key}` }
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id }
    });
  }
  const email = `${emailPrefix}-${randomUUID().slice(0, 8)}@isolation-test.local`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      fullName: `${emailPrefix} (test isolation)`,
      globalRole: 'USER',
      emailVerified: true,
      isActive: true
    }
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, tenantId: null } });
  const accessToken = generateAccessToken({ userId: user.id, email: user.email, globalRole: user.globalRole });
  return { id: user.id, email, authHeader: `Bearer ${accessToken}` };
}

export async function suspendTenant(tenantId: string): Promise<void> {
  await prisma.tenant.update({ where: { id: tenantId }, data: { status: TenantStatus.SUSPENDED } });
}

/** Cree un contact CRM minimal, directement, pour l'agence donnee. */
export async function createContactDirect(tenantId: string, label: string): Promise<string> {
  const contact = await prisma.crmContact.create({
    data: {
      tenantId,
      firstName: label,
      lastName: 'Test',
      email: `${label.toLowerCase()}-${randomUUID().slice(0, 8)}@isolation-test.local`
    }
  });
  return contact.id;
}

/** Cree un bien minimal, directement, pour l'agence donnee. */
export async function createPropertyDirect(tenantId: string, label: string): Promise<string> {
  const property = await prisma.property.create({
    data: {
      tenantId,
      internalReference: `TST-${randomUUID().slice(0, 8)}`,
      propertyType: PropertyType.APPARTEMENT,
      ownershipType: PropertyOwnershipType.TENANT,
      title: label,
      description: `Bien de test (${label}) — genere par les fixtures du lot E.`,
      address: '1 rue du Test'
    }
  });
  return property.id;
}

/** Cree un ticket de maintenance minimal, directement, pour l'agence donnee (necessite un bien). */
export async function createMaintenanceTicketDirect(
  tenantId: string,
  propertyId: string,
  label: string
): Promise<string> {
  const ticket = await prisma.maintenanceTicket.create({
    data: {
      tenant_id: tenantId,
      property_id: propertyId,
      title: label,
      category: 'PLUMBING',
      priority: 'MEDIUM',
      description: `Ticket de test (${label}) — genere par les fixtures du lot E.`
    }
  });
  return ticket.id;
}

/** Utilisateur sans aucune appartenance a une agence (ni role), avec un jeton d'acces valide. */
export async function createOutsiderUser(emailPrefix: string): Promise<TestUser> {
  const email = `${emailPrefix}-${randomUUID().slice(0, 8)}@isolation-test.local`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: null,
      fullName: `${emailPrefix} (test isolation)`,
      globalRole: 'USER',
      emailVerified: true,
      isActive: true
    }
  });
  const accessToken = generateAccessToken({ userId: user.id, email: user.email, globalRole: user.globalRole });
  return { id: user.id, email, authHeader: `Bearer ${accessToken}` };
}

export interface RentalFixture {
  propertyId: string;
  propertyReference: string;
  leaseId: string;
  leaseNumber: string;
  renterName: string;
  installmentId: string;
  paymentId: string;
  documentId: string;
}

/**
 * Cree, directement en base, un bail complet pour l'agence donnee : bien,
 * locataire (utilisateur + client), bail, echeance payee, paiement encaisse,
 * affectation et un document de location SANS fichier sur disque.
 */
export async function createRentalFixtureDirect(
  tenantId: string,
  createdByUserId: string,
  label: string
): Promise<RentalFixture> {
  const suffix = randomUUID().slice(0, 8);
  const property = await prisma.property.create({
    data: {
      tenantId,
      internalReference: `REF-${label}-${suffix}`,
      propertyType: PropertyType.APPARTEMENT,
      ownershipType: PropertyOwnershipType.TENANT,
      title: `Bien secret ${label} ${suffix}`,
      description: `Bien de test (${label})`,
      address: '1 rue du Test'
    }
  });
  const renterName = `Locataire Secret ${label} ${suffix}`;
  const renterUser = await prisma.user.create({
    data: {
      email: `renter-${label.toLowerCase()}-${suffix}@isolation-test.local`,
      passwordHash: null,
      fullName: renterName,
      globalRole: 'USER',
      emailVerified: true,
      isActive: true
    }
  });
  const client = await prisma.tenantClient.create({
    data: { userId: renterUser.id, tenantId, clientType: 'RENTER' }
  });
  const leaseNumber = `BAIL-${label}-${suffix}`;
  const lease = await prisma.rentalLease.create({
    data: {
      tenant_id: tenantId,
      property_id: property.id,
      primary_renter_client_id: client.id,
      lease_number: leaseNumber,
      status: 'ACTIVE',
      start_date: new Date('2026-01-01T00:00:00.000Z'),
      rent_amount: 100000,
      currency: 'XOF',
      created_by_user_id: createdByUserId
    }
  });
  const installment = await prisma.rentalInstallment.create({
    data: {
      tenant_id: tenantId,
      lease_id: lease.id,
      period_year: 2026,
      period_month: 1,
      due_date: new Date('2026-01-05T00:00:00.000Z'),
      status: 'PAID',
      currency: 'XOF',
      amount_rent: 100000,
      amount_paid: 100000
    }
  });
  const payment = await prisma.rentalPayment.create({
    data: {
      tenant_id: tenantId,
      lease_id: lease.id,
      method: 'CASH',
      status: 'SUCCESS',
      currency: 'XOF',
      amount: 100000,
      idempotency_key: `idem-${label}-${suffix}`
    }
  });
  await prisma.rentalPaymentAllocation.create({
    data: {
      tenant_id: tenantId,
      payment_id: payment.id,
      installment_id: installment.id,
      amount: 100000,
      currency: 'XOF'
    }
  });
  const document = await prisma.rentalDocument.create({
    data: {
      tenant_id: tenantId,
      type: 'RENT_RECEIPT',
      status: 'FINAL',
      lease_id: lease.id,
      installment_id: installment.id,
      payment_id: payment.id,
      document_number: `DOC-${label}-${suffix}`,
      created_by_user_id: createdByUserId
    }
  });
  return {
    propertyId: property.id,
    propertyReference: property.internalReference,
    leaseId: lease.id,
    leaseNumber,
    renterName,
    installmentId: installment.id,
    paymentId: payment.id,
    documentId: document.id
  };
}

/** Nettoyage best-effort : supprime les agences de test et tout ce qui en depend en cascade. */
export async function cleanupTenants(tenantIds: string[]): Promise<void> {
  for (const tenantId of tenantIds) {
    try {
      await prisma.tenant.delete({ where: { id: tenantId } });
    } catch {
      // Best-effort : la base de test est jetable, une ligne orpheline n'est pas bloquante.
    }
  }
}
