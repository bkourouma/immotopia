import { prisma, PrismaTransactionClient } from '../utils/database';
import {
  TenantType,
  TenantStatus,
  ModuleKey,
  SubscriptionPlan,
  BillingCycle,
  SubscriptionStatus,
  MembershipStatus,
  InvitationStatus,
  QuotaPolicy
} from '@prisma/client';
import { logger } from '../utils/logger';
import { logAuditEvent, AuditActionKey } from './audit-service';
import { hashPassword } from '../utils/password-utils';
import crypto from 'crypto';
import { generateSlugFromName } from './tenant-service';
import {
  createInvitationRecordTx,
  buildInvitationAcceptUrl,
  generateInvitationToken,
  resolveRoleLabels
} from './invitation-service';
import { emailService } from './email-service';
import { ensureOperationalChartOfAccountsTx, ensureOperationalJournalTx } from '../lib/finance/accounting';
import { ensureDefaultTreasuryAccountTx } from '../lib/treasury/accounts';
import { ensureStockSettingsTx } from '../lib/finance/stock-referentiel';
import { ensureRentalAccountsTx } from '../lib/owner-account/accounts';
import { DEFAULT_FINANCE_SETTINGS } from '../lib/settings/finance-settings';
import { ProvisionTenantRequest, ProvisionTenantResult } from '../types/tenant-types';
import { tenantProvisioningIdempotencyStore } from '../utils/idempotency';
import {
  PACK,
  PARTICULIER_PACKS,
  TRIAL_DAYS,
  addBillingPeriod,
  packModules,
  packsForModules
} from '../lib/subscription';
import { ValidationError } from '../middleware/error-middleware';
import { ensurePersonalSpaceOwnerRole, grantPersonalSpaceOwnerRole } from '../lib/patrimoine/personal-permissions';
import {
  linkExtensionsToPacksTx,
  loadCatalogByCodes,
  planInitialItems,
  RequestedItem
} from './subscription-v2-service';

/**
 * Provisioning d'une agence en un clic (lot F1, docs/architecture/PLAN-MULTI-TENANT.md).
 *
 * `provisionTenant` cree, dans UNE transaction Prisma, tout ce qu'une agence
 * neuve a besoin pour etre utilisable des l'acceptation de l'invitation de son
 * administrateur : Tenant ACTIF, modules, abonnement d'essai, parametres
 * financiers par defaut, socle comptable/tresorerie/stock, et l'invitation de
 * l'administrateur. L'envoi de l'e-mail d'invitation vient APRES le commit,
 * jamais dedans : un e-mail parti doit toujours pointer vers une agence qui
 * existe reellement, et une transaction ne doit jamais attendre un appel
 * reseau externe.
 */

/** Delais de la transaction de creation (attente d'une connexion, duree totale). */
const PROVISIONING_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

/** Fenetre du controle d'idempotence cote base (lot F1.9). */
const IDEMPOTENCY_DB_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Modules par defaut, par type d'agence (decision [D] du plan). Ne sert plus
 * qu'a l'ANCIEN format (sans `items`), converti en packs par
 * `packsForModules` : AGENCY -> AGENCE, OPERATOR -> INTEGRE.
 */
const DEFAULT_MODULES_BY_TYPE: Record<TenantType, ModuleKey[]> = {
  [TenantType.AGENCY]: [ModuleKey.MODULE_AGENCY],
  [TenantType.OPERATOR]: [ModuleKey.MODULE_AGENCY, ModuleKey.MODULE_SYNDIC, ModuleKey.MODULE_PROMOTER],
  // Espace personnel (lot 4). Ancien format sans `items` : `runProvisioningTx`
  // le traite a part (pack PARTICULIER_GRATUIT, pas Patrimoine Essentiel).
  [TenantType.PARTICULIER]: [ModuleKey.MODULE_PATRIMOINE]
};

/** Slug unique a partir du nom, en tentant `-2`, `-3`... comme les autres slugs de la plateforme. */
async function generateUniqueSlugTx(tx: PrismaTransactionClient, name: string): Promise<string> {
  const base = generateSlugFromName(name) || 'agence';
  let candidate = base;
  let suffix = 2;
  // eslint-disable-next-line no-await-in-loop -- verification sequentielle necessaire : chaque essai depend du precedent.
  while (await tx.tenant.findFirst({ where: { slug: candidate }, select: { id: true } })) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

interface ProvisioningOutcome {
  result: ProvisionTenantResult;
  tenantId: string;
  tenantName: string;
  adminEmail: string;
  adminRoleId: string;
  inviteToken: string;
  inviteExpiresAt: Date;
}

/** Donnees d'un espace a creer par `createTenantCoreTx` (agence ou espace personnel). */
export interface TenantCoreInput {
  name: string;
  type: TenantType;
  /** Slug impose (espace personnel : non previsible) ; sinon derive du nom, suffixe `-2`, `-3`... si pris. */
  slug?: string;
  legalName?: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  website?: string;
  brandingPrimaryColor?: string;
  /** Packs et extensions souscrits, valides et chiffres par `planInitialItems` AVANT toute ecriture. */
  requested: RequestedItem[];
  planKey: SubscriptionPlan | null;
  billingCycle: BillingCycle;
  /**
   * `TRIALING` (agence : essai de TRIAL_DAYS jours, prolongeable) ou `ACTIVE`
   * (espace personnel : pas d'essai, periode courante d'un cycle). `quotaPolicy`
   * n'est ecrite que si elle est fournie (sinon le defaut de la base).
   */
  subscription: { status: 'TRIALING' | 'ACTIVE'; quotaPolicy?: QuotaPolicy };
  actorUserId: string;
}

export interface TenantCoreResult {
  tenant: Awaited<ReturnType<PrismaTransactionClient['tenant']['create']>>;
  modules: ModuleKey[];
  subscription: Awaited<ReturnType<PrismaTransactionClient['subscription']['create']>>;
  itemsSummary: ProvisionTenantResult['subscription']['items'];
  tenantAdminRoleId: string;
  now: Date;
}

/**
 * Coeur transactionnel du provisionnement, SANS utilisateur ni invitation :
 * Tenant ACTIF, modules (source PACK), abonnement et elements au prix fige,
 * parametres financiers, socle comptable/tresorerie/stock, et identifiant du
 * role TENANT_ADMIN. A appeler DANS une transaction (`prisma.$transaction`
 * avec `PROVISIONING_TX_OPTIONS` : plusieurs dizaines d'ecritures).
 *
 * Partage par `provisionTenant` (agence creee par le super-admin : essai puis
 * invitation) et par la creation d'un espace personnel (lot 4B :
 * appartenance ACTIVE immediate, ni invitation ni e-mail). L'appelant cree
 * lui-meme Membership et UserRole.
 */
export async function createTenantCoreTx(
  tx: PrismaTransactionClient,
  input: TenantCoreInput
): Promise<TenantCoreResult> {
  const { actorUserId } = input;
  const catalog = await loadCatalogByCodes(
    tx,
    input.requested.map(r => r.code)
  );
  const plannedItems = planInitialItems(input.requested, catalog);
  const modules = packModules(
    plannedItems.map(p => ({ kind: p.catalog.kind, modules: p.catalog.modules }))
  ) as ModuleKey[];

  // 1. Tenant ACTIF, slug unique.
  const slug = input.slug ?? (await generateUniqueSlugTx(tx, input.name));
  const tenant = await tx.tenant.create({
    data: {
      name: input.name,
      slug,
      type: input.type,
      status: TenantStatus.ACTIVE,
      isActive: true,
      legalName: input.legalName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      country: input.country,
      city: input.city,
      address: input.address,
      website: input.website,
      brandingPrimaryColor: input.brandingPrimaryColor
    }
  });

  // 2. Modules, deduits des packs (source PACK : `syncTenantModulesTx`
  // les recalcule a chaque changement de pack).
  await tx.tenantModule.createMany({
    data: modules.map(moduleKey => ({
      tenantId: tenant.id,
      moduleKey,
      enabled: true,
      enabledAt: new Date(),
      enabledBy: actorUserId,
      source: 'PACK' as const
    }))
  });

  // 3. Abonnement (essai D8 : 30 jours, prolongeable ; ou actif d'emblee) et
  // elements souscrits au prix du catalogue, FIGE (D12).
  const now = new Date();
  const trial = input.subscription.status === 'TRIALING';
  const currentPeriodEnd = trial
    ? new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
    : addBillingPeriod(now, input.billingCycle);
  const subscription = await tx.subscription.create({
    data: {
      tenantId: tenant.id,
      planKey: input.planKey,
      billingCycle: input.billingCycle,
      status: trial ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
      startAt: now,
      currentPeriodStart: now,
      currentPeriodEnd,
      ...(trial ? { trialEndsAt: currentPeriodEnd } : {}),
      nextBillingAt: currentPeriodEnd,
      ...(input.subscription.quotaPolicy ? { quotaPolicy: input.subscription.quotaPolicy } : {})
    }
  });
  await tx.subscriptionItem.createMany({
    data: plannedItems.map(p => ({
      subscriptionId: subscription.id,
      tenantId: tenant.id,
      catalogItemId: p.catalog.id,
      quantity: p.quantity,
      unitMonthlyPrice: p.unitMonthlyPrice,
      unitSetupPrice: p.unitSetupPrice,
      status: 'ACTIVE' as const,
      startsAt: now,
      addedByUserId: actorUserId
    }))
  });
  // Extensions souscrites d'emblee : liees a leur pack (retirees avec lui).
  await linkExtensionsToPacksTx(tx, tenant.id);
  const itemsSummary = plannedItems.map(p => ({
    code: p.catalog.code,
    kind: p.catalog.kind,
    quantity: p.quantity,
    unitMonthlyPrice: p.unitMonthlyPrice,
    unitSetupPrice: p.unitSetupPrice
  }));

  // 4. Parametres financiers par defaut : un `create` sans donnees suffit,
  // toutes les colonnes ont un defaut Prisma qui reprend exactement
  // `DEFAULT_FINANCE_SETTINGS` (lib/settings/finance-settings.ts).
  await tx.agencyFinanceSettings.create({ data: { tenantId: tenant.id } });

  // 5. Socle comptable, tresorerie et stock — fonctions `ensure*Tx`
  // existantes (lecture puis creation de ce qui manque), non modifiees ici.
  await ensureOperationalChartOfAccountsTx(tx, tenant.id);
  await ensureOperationalJournalTx(tx, tenant.id, now.getFullYear(), 'GENERAL');
  await ensureDefaultTreasuryAccountTx(tx, tenant.id, 'CASH');
  await ensureRentalAccountsTx(tx, tenant.id, DEFAULT_FINANCE_SETTINGS);
  await ensureStockSettingsTx(tx, tenant.id);

  const tenantAdminRole = await tx.role.findFirst({
    where: { key: 'TENANT_ADMIN', scope: 'TENANT' },
    select: { id: true }
  });
  if (!tenantAdminRole) {
    throw new Error('Le rôle TENANT_ADMIN est introuvable : vérifiez le seed des rôles plateforme.');
  }

  return { tenant, modules, subscription, itemsSummary, tenantAdminRoleId: tenantAdminRole.id, now };
}

/**
 * Coherence type d'espace / packs (creation super-admin) : un espace PARTICULIER
 * n'accepte que des packs Particulier, et une agence ou un operateur n'en
 * accepte aucun (sinon un espace aurait un menu et des droits incoherents, ou
 * une agence l'abonnement gratuit d'un particulier). Erreur typee 422.
 */
export function assertTenantTypeMatchesPacks(type: TenantType, requested: readonly RequestedItem[]): void {
  const particulierOnly = type === TenantType.PARTICULIER;
  const offending = requested.filter(item => PARTICULIER_PACKS.includes(item.code) !== particulierOnly);
  if (offending.length === 0) return;
  throw new ValidationError(
    particulierOnly
      ? 'Un espace personnel n’accepte que des packs Particulier.'
      : 'Les packs Particulier sont réservés aux espaces personnels.',
    [{ field: 'items', message: offending.map(item => item.code).join(', ') }]
  );
}

/** La partie ECRITURE, tout-ou-rien : tout ce que F1.1 a F1.7 decrit, sauf l'envoi d'e-mail (F1.8) et l'idempotence (F1.9). */
async function runProvisioningTx(input: ProvisionTenantRequest, actorUserId: string): Promise<ProvisioningOutcome> {
  return prisma.$transaction(async tx => {
    const type = input.type ?? TenantType.AGENCY;
    const billingCycle = (input.billingCycle ?? 'MONTHLY') as BillingCycle;

    // Composition de l'abonnement (docs/architecture/PLAN-ABONNEMENTS.md) :
    // `items` (packs + extensions) est le format de reference. L'ancien
    // format (`modules`, `planKey`) reste accepte et converti en packs ; il
    // garde alors l'etiquette `planKey` (PRO par defaut) des anciens ecrans.
    // Validation et prix AVANT toute ecriture (dans `createTenantCoreTx`).
    let requested: RequestedItem[];
    let planKey: SubscriptionPlan | null;
    if (input.items?.length) {
      requested = input.items;
      planKey = (input.planKey ?? null) as SubscriptionPlan | null;
    } else {
      const legacyModules = input.modules?.length ? [...new Set(input.modules)] : DEFAULT_MODULES_BY_TYPE[type];
      requested =
        type === TenantType.PARTICULIER && !input.modules?.length
          ? [{ code: PACK.PARTICULIER_GRATUIT, quantity: 1 }]
          : packsForModules(legacyModules).packs.map(code => ({ code, quantity: 1 }));
      planKey = (input.planKey ?? 'PRO') as SubscriptionPlan;
    }

    assertTenantTypeMatchesPacks(type, requested);

    // 1 a 5. Tenant, modules, abonnement d'essai, parametres financiers, socle.
    const core = await createTenantCoreTx(tx, {
      name: input.name,
      type,
      legalName: input.legalName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      country: input.country,
      city: input.city,
      address: input.address,
      website: input.website,
      brandingPrimaryColor: input.brandingPrimaryColor,
      requested,
      planKey,
      billingCycle,
      subscription: { status: 'TRIALING' },
      actorUserId
    });
    const { tenant, modules, subscription, itemsSummary, now } = core;
    const tenantAdminRole = { id: core.tenantAdminRoleId };

    // 6. Administrateur : utilisateur trouve ou cree, Membership, role,
    // invitation. Le tenant vient d'etre cree DANS cette transaction : aucune
    // ligne existante ne peut deja pointer vers lui, donc chaque `create`
    // ci-dessous est sans risque de doublon (pas besoin d'upsert).
    let adminUser = await tx.user.findFirst({
      where: { email: { equals: input.adminEmail, mode: 'insensitive' } }
    });
    const existingUser = Boolean(adminUser);

    if (!adminUser) {
      // Convention reprise de `getOrCreateTenantClientFromContact`
      // (tenant-service.ts) : mot de passe jamais utilisable, l'acces reel se
      // fait par le jeton d'invitation ci-dessous.
      const throwawayPassword = crypto.randomBytes(32).toString('base64url');
      const passwordHash = await hashPassword(throwawayPassword);
      adminUser = await tx.user.create({
        data: {
          email: input.adminEmail,
          fullName: input.adminFullName,
          passwordHash,
          emailVerified: false,
          isActive: true
        }
      });
    }

    await tx.membership.create({
      data: {
        userId: adminUser.id,
        tenantId: tenant.id,
        status: MembershipStatus.PENDING_INVITE,
        invitedBy: actorUserId,
        invitedAt: now
      }
    });

    await tx.userRole.create({
      data: { userId: adminUser.id, roleId: tenantAdminRole.id, tenantId: tenant.id }
    });
    // Espace PARTICULIER : l'administrateur porte aussi PATRIMOINE_PERSONAL_* (role PERSONAL_SPACE_OWNER),
    // que TENANT_ADMIN d'agence n'a pas ; l'invitation lui rend les deux roles.
    const inviteRoleIds = [tenantAdminRole.id];
    if (type === TenantType.PARTICULIER) {
      const ownerRoleId = await ensurePersonalSpaceOwnerRole(tx);
      await grantPersonalSpaceOwnerRole(tx, ownerRoleId, adminUser.id, tenant.id);
      inviteRoleIds.push(ownerRoleId);
    }

    const { invitation, token } = await createInvitationRecordTx(tx, {
      tenantId: tenant.id,
      email: input.adminEmail,
      roleIds: inviteRoleIds,
      invitedByUserId: actorUserId
    });

    return {
      result: {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, type: tenant.type, status: tenant.status },
        modules,
        subscription: {
          planKey: subscription.planKey ?? null,
          billingCycle: subscription.billingCycle,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
          trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
          items: itemsSummary
        },
        admin: {
          userId: adminUser.id,
          email: adminUser.email,
          fullName: adminUser.fullName ?? input.adminFullName,
          existingUser
        },
        invitation: {
          id: invitation.id,
          expiresAt: invitation.expiresAt.toISOString(),
          acceptUrl: buildInvitationAcceptUrl(token)
        },
        // Rempli par l'appelant apres l'envoi (hors transaction) : un e-mail
        // ne doit jamais etre tente tant que la transaction n'a pas commit.
        emailSent: false
      },
      tenantId: tenant.id,
      tenantName: tenant.name,
      adminEmail: adminUser.email,
      adminRoleId: tenantAdminRole.id,
      inviteToken: token,
      inviteExpiresAt: invitation.expiresAt
    };
    // Le plan de comptes et les journaux ecrivent plusieurs dizaines de lignes :
    // les 5 s par defaut d'une transaction interactive ne suffisent pas toujours.
  }, PROVISIONING_TX_OPTIONS);
}

/**
 * Rejeu idempotent (base) : regenere un jeton d'invitation utilisable pour
 * l'agence deja creee, sans rien recreer.
 *
 * Le jeton en clair n'est jamais persiste (seul son hash l'est) : impossible
 * de reconstruire le lien d'origine pour une agence creee par une AUTRE
 * instance du process (donc absente du cache memoire). On emet un nouveau
 * jeton pour la meme invitation — exactement ce que fait un "renvoyer
 * l'invitation" manuel — plutot que d'echouer ou de mentir sur `acceptUrl`.
 */
async function refreshReplayInvitationToken(
  invitationId: string,
  roleIds: string[],
  tenantName: string,
  tenantId: string,
  email: string
): Promise<{ acceptUrl: string; emailSent: boolean; expiresAt: Date }> {
  const { token, hash } = generateInvitationToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await prisma.invitation.update({ where: { id: invitationId }, data: { tokenHash: hash, expiresAt } });
  const acceptUrl = buildInvitationAcceptUrl(token);

  let emailSent = false;
  try {
    const roleLabels = await resolveRoleLabels(roleIds);
    await emailService.sendInviteEmail(email, token, tenantName, roleLabels, expiresAt, tenantId);
    emailSent = true;
  } catch (error) {
    logger.error('Tenant provisioning replay: failed to resend invitation email', { invitationId, error });
  }

  return { acceptUrl, emailSent, expiresAt };
}

/** Une agence recemment creee par ce meme super-admin, avec le meme nom et le meme e-mail admin (voir F1.9). */
async function findRecentDuplicateTenantId(
  actorUserId: string,
  name: string,
  adminEmail: string
): Promise<string | null> {
  const since = new Date(Date.now() - IDEMPOTENCY_DB_WINDOW_MS);
  const logs = await prisma.auditLog.findMany({
    where: { actorUserId, actionKey: 'TENANT_PROVISIONED', createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { payload: true }
  });

  for (const log of logs) {
    const payload = (log.payload as Record<string, unknown> | null) ?? {};
    if (payload.name === name && payload.adminEmail === adminEmail && typeof payload.tenantId === 'string') {
      return payload.tenantId;
    }
  }
  return null;
}

/** Reconstruit la reponse de F2 pour une agence deja creee, sans rien ecrire d'autre qu'un eventuel nouveau jeton d'invitation. */
async function buildReplayResult(tenantId: string, input: ProvisionTenantRequest): Promise<ProvisionTenantResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true, type: true, status: true }
  });
  if (!tenant) {
    throw new Error("Rejeu idempotent : l'agence déjà créée est introuvable.");
  }

  const [modules, subscription, invitation, membership, items] = await Promise.all([
    prisma.tenantModule.findMany({ where: { tenantId, enabled: true }, select: { moduleKey: true } }),
    prisma.subscription.findUnique({ where: { tenantId } }),
    prisma.invitation.findFirst({ where: { tenantId, email: input.adminEmail }, orderBy: { createdAt: 'desc' } }),
    prisma.membership.findFirst({
      where: { tenantId, user: { email: { equals: input.adminEmail, mode: 'insensitive' } } },
      include: { user: { select: { id: true, email: true, fullName: true } } }
    }),
    prisma.subscriptionItem.findMany({
      where: { tenantId, status: { not: 'ENDED' } },
      select: {
        quantity: true,
        unitMonthlyPrice: true,
        unitSetupPrice: true,
        catalogItem: { select: { code: true, kind: true } }
      },
      orderBy: { createdAt: 'asc' }
    })
  ]);

  if (!subscription || !invitation || !membership) {
    throw new Error('Rejeu idempotent : données incomplètes pour cette agence.');
  }

  let acceptUrl = '';
  let emailSent = false;
  let expiresAt = invitation.expiresAt;

  if (invitation.status === InvitationStatus.PENDING) {
    const refreshed = await refreshReplayInvitationToken(
      invitation.id,
      invitation.roleIds,
      tenant.name,
      tenantId,
      invitation.email
    );
    acceptUrl = refreshed.acceptUrl;
    emailSent = refreshed.emailSent;
    expiresAt = refreshed.expiresAt;
  }

  return {
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, type: tenant.type, status: tenant.status },
    modules: modules.map(m => m.moduleKey),
    subscription: {
      planKey: subscription.planKey ?? null,
      billingCycle: subscription.billingCycle,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      items: (items ?? []).map(i => ({
        code: i.catalogItem.code,
        kind: i.catalogItem.kind,
        quantity: i.quantity,
        unitMonthlyPrice: Number(i.unitMonthlyPrice),
        unitSetupPrice: Number(i.unitSetupPrice)
      }))
    },
    admin: {
      userId: membership.user.id,
      email: membership.user.email,
      fullName: membership.user.fullName ?? input.adminFullName,
      existingUser: true
    },
    invitation: { id: invitation.id, expiresAt: expiresAt.toISOString(), acceptUrl },
    emailSent
  };
}

/**
 * Cree une agence prete a l'emploi en un clic (F1). Voir le contrat d'API F2
 * dans docs/architecture/PLAN-MULTI-TENANT.md pour la forme exacte du corps
 * et de la reponse.
 *
 * @param idempotencyKey En-tete `Idempotency-Key` optionnel (<=100 caracteres,
 * verifie par l'appelant). Meme cle + meme super-admin dans les 24h : le
 * resultat deja produit est renvoye tel quel, rien n'est recree.
 * @returns `replay: true` quand la reponse vient d'une creation anterieure
 * (le controleur y lit le code HTTP a renvoyer : 200 au lieu de 201).
 */
export async function provisionTenant(
  input: ProvisionTenantRequest,
  actorUserId: string,
  idempotencyKey?: string
): Promise<{ result: ProvisionTenantResult; replay: boolean }> {
  // Barriere 1 : memoire du process, immediate — le cas courant (double clic
  // sur le meme bouton, meme onglet).
  if (idempotencyKey) {
    const cached = tenantProvisioningIdempotencyStore.get(actorUserId, idempotencyKey) as
      ProvisionTenantResult | undefined;
    if (cached) {
      logger.info('Tenant provisioning: idempotent replay (memory)', {
        actorUserId,
        idempotencyKey,
        tenantId: cached.tenant.id
      });
      return { result: cached, replay: true };
    }
  }

  // Barriere 2 : base de donnees — resiste a un redemarrage du process ou a
  // un deuxieme appel sans (ou avec un autre) en-tete `Idempotency-Key`, tant
  // que le nom de l'agence et l'e-mail de l'administrateur sont identiques.
  const duplicateTenantId = await findRecentDuplicateTenantId(actorUserId, input.name, input.adminEmail);
  if (duplicateTenantId) {
    logger.info('Tenant provisioning: idempotent replay (audit log)', { actorUserId, tenantId: duplicateTenantId });
    const result = await buildReplayResult(duplicateTenantId, input);
    if (idempotencyKey) {
      tenantProvisioningIdempotencyStore.set(actorUserId, idempotencyKey, result);
    }
    return { result, replay: true };
  }

  const outcome = await runProvisioningTx(input, actorUserId);

  // Journal d'audit, APRES commit (la file d'audit ecrit par un client Prisma
  // separe, hors de la transaction ci-dessus). TENANT_CREATED pour rester
  // compatible avec tout ce qui filtre deja sur cette cle ; TENANT_PROVISIONED
  // en plus, avec le detail complet — c'est lui que relit
  // `findRecentDuplicateTenantId`. `actionKey` est une colonne texte libre
  // (voir prisma/schema.prisma, model AuditLog) : aucune migration requise
  // pour cette nouvelle valeur.
  logAuditEvent({
    actorUserId,
    tenantId: outcome.tenantId,
    actionKey: AuditActionKey.TENANT_CREATED,
    entityType: 'Tenant',
    entityId: outcome.tenantId,
    payload: {
      provisioned: true,
      modules: outcome.result.modules,
      planKey: outcome.result.subscription.planKey,
      items: outcome.result.subscription.items.map(i => ({ code: i.code, quantity: i.quantity }))
    }
  });
  logAuditEvent({
    actorUserId,
    tenantId: outcome.tenantId,
    actionKey: 'TENANT_PROVISIONED',
    entityType: 'Tenant',
    entityId: outcome.tenantId,
    payload: {
      tenantId: outcome.tenantId,
      name: input.name,
      adminEmail: input.adminEmail,
      idempotencyKey: idempotencyKey ?? null,
      modules: outcome.result.modules,
      planKey: outcome.result.subscription.planKey,
      items: outcome.result.subscription.items.map(i => ({ code: i.code, quantity: i.quantity }))
    }
  });

  // E-mail d'invitation, APRES commit : un echec ne defait rien, il est
  // simplement reporte dans `emailSent: false` (l'invitation reste renvoyable
  // via POST /api/tenants/:tenantId/users/invitations/:invitationId/resend).
  let emailSent = false;
  try {
    const roleLabels = await resolveRoleLabels([outcome.adminRoleId]);
    await emailService.sendInviteEmail(
      outcome.adminEmail,
      outcome.inviteToken,
      outcome.tenantName,
      roleLabels,
      outcome.inviteExpiresAt,
      outcome.tenantId
    );
    emailSent = true;
  } catch (error) {
    logger.error('Tenant provisioning: invitation email failed (tenant kept, resend possible)', {
      tenantId: outcome.tenantId,
      adminEmail: outcome.adminEmail,
      error
    });
  }

  const result: ProvisionTenantResult = { ...outcome.result, emailSent };

  if (idempotencyKey) {
    tenantProvisioningIdempotencyStore.set(actorUserId, idempotencyKey, result);
  }

  return { result, replay: false };
}
