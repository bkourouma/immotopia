import crypto from 'crypto';
import { MembershipStatus, QuotaPolicy, TenantType } from '@prisma/client';
import { prisma } from '../../utils/database';
import { AppError, ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { isProduction } from '../../config/env';
import { PACK } from '../../lib/subscription';
import { logAuditEvent } from '../audit-service';
import { isEmailDeliveryConfigured } from '../email-service';
import { generateSlugFromName } from '../tenant-service';
import { createTenantCoreTx } from '../tenant-provisioning-service';
import { ensurePersonalSpaceOwnerRole, grantPersonalSpaceOwnerRole } from '../../lib/patrimoine/personal-permissions';
import type { CreatePersonalSpaceInput } from './schemas';

/**
 * Creation de l'espace personnel en libre-service (lot 4B,
 * specs/026-particuliers-libre-service). Une transaction : tenant PARTICULIER,
 * modules, abonnement ACTIVE du pack gratuit (quotaPolicy BLOCK), Membership
 * ACTIVE, role TENANT_ADMIN. L'audit part apres le commit.
 */

export const PERSONAL_SPACE_AUDIT_ACTION = 'PERSONAL_SPACE_CREATED';
export const PERSONAL_SPACE_EXISTS_CODE = 'PERSONAL_SPACE_EXISTS';

const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };
const SLUG_BASE_MAX = 40;
const SLUG_SUFFIX_LENGTH = 6;
const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface PersonalSpaceResult {
  tenantId: string;
  slug: string;
  name: string;
}

/** 409 `PERSONAL_SPACE_EXISTS` : `data: { tenantId }`, pour que l'interface redirige vers l'espace. */
export class PersonalSpaceExistsError extends ConflictError {
  constructor(tenantId: string) {
    super('Vous avez déjà un espace personnel.');
    this.code = PERSONAL_SPACE_EXISTS_CODE;
    this.data = { tenantId };
  }
}

/** Slug non previsible : nom simplifie + suffixe aleatoire (CSPRNG) de 6 caracteres. */
export function buildPersonalSpaceSlug(displayName: string): string {
  const base = generateSlugFromName(displayName).slice(0, SLUG_BASE_MAX).replace(/-+$/g, '') || 'espace';
  let suffix = '';
  for (let i = 0; i < SLUG_SUFFIX_LENGTH; i += 1) suffix += SLUG_ALPHABET[crypto.randomInt(SLUG_ALPHABET.length)];
  return `${base}-${suffix}`;
}

/** Memes conditions que l'inscription : production sans serveur d'e-mails -> 503. */
function assertSignupAvailable(): void {
  if (isProduction && !isEmailDeliveryConfigured()) {
    throw new AppError("L'inscription est momentanément indisponible.", 503, 'SIGNUP_UNAVAILABLE');
  }
}

/**
 * Espace personnel deja administre par l'utilisateur (identifiant du tenant),
 * sinon null. Seule une appartenance ACTIVE, avec le role TENANT_ADMIN sur ce
 * tenant, compte : une appartenance revoquee ou suspendue, ou un simple
 * invite d'un espace, ne bloque pas la creation de SON espace.
 */
async function findOwnPersonalSpaceTenantId(
  tx: Pick<typeof prisma, 'membership' | 'userRole'>,
  userId: string
): Promise<string | null> {
  const memberships = await tx.membership.findMany({
    where: { userId, status: MembershipStatus.ACTIVE, tenant: { type: TenantType.PARTICULIER } },
    select: { tenantId: true },
    orderBy: { createdAt: 'asc' }
  });
  if (memberships.length === 0) return null;
  const admin = await tx.userRole.findFirst({
    where: { userId, tenantId: { in: memberships.map(m => m.tenantId) }, role: { key: 'TENANT_ADMIN' } },
    select: { tenantId: true }
  });
  return admin?.tenantId ?? null;
}

async function createInTransaction(
  userId: string,
  contactEmail: string,
  input: CreatePersonalSpaceInput
): Promise<PersonalSpaceResult> {
  return prisma.$transaction(async tx => {
    // Garde d'unicite sous concurrence : les creations d'un meme utilisateur
    // s'executent l'une apres l'autre (verrou tenu jusqu'a la fin de la transaction).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const existing = await findOwnPersonalSpaceTenantId(tx, userId);
    if (existing) throw new PersonalSpaceExistsError(existing);

    const core = await createTenantCoreTx(tx, {
      name: input.displayName,
      type: TenantType.PARTICULIER,
      slug: buildPersonalSpaceSlug(input.displayName),
      contactEmail,
      contactPhone: input.phone,
      country: input.country,
      requested: [{ code: PACK.PARTICULIER_GRATUIT, quantity: 1 }],
      planKey: null,
      billingCycle: 'MONTHLY',
      subscription: { status: 'ACTIVE', quotaPolicy: QuotaPolicy.BLOCK },
      actorUserId: userId
    });

    await tx.membership.create({
      data: {
        userId,
        tenantId: core.tenant.id,
        status: MembershipStatus.ACTIVE,
        invitedBy: userId,
        invitedAt: core.now,
        acceptedAt: core.now
      }
    });
    await tx.userRole.create({ data: { userId, roleId: core.tenantAdminRoleId, tenantId: core.tenant.id } });
    // Donnees personnelles du patrimoine : role dedie (PATRIMOINE_PERSONAL_*), que TENANT_ADMIN d'agence n'a pas.
    const ownerRoleId = await ensurePersonalSpaceOwnerRole(tx);
    await grantPersonalSpaceOwnerRole(tx, ownerRoleId, userId, core.tenant.id);

    return { tenantId: core.tenant.id, slug: core.tenant.slug, name: core.tenant.name };
  }, TX_OPTIONS);
}

/** Rejeu idempotent en memoire (meme cle + meme utilisateur) ; la promesse couvre aussi les doubles appels simultanes. */
const idempotency = new Map<string, { promise: Promise<PersonalSpaceResult>; expiresAt: number }>();

function sweepIdempotency(): void {
  const now = Date.now();
  for (const [key, entry] of idempotency) if (entry.expiresAt <= now) idempotency.delete(key);
}

/** Vide le cache d'idempotence (tests). */
export function resetPersonalSpaceIdempotency(): void {
  idempotency.clear();
}

async function createOnce(userId: string, input: CreatePersonalSpaceInput): Promise<PersonalSpaceResult> {
  assertSignupAvailable();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerified: true, isActive: true }
  });
  if (!user || !user.isActive) throw new NotFoundError('Utilisateur introuvable.');
  if (!user.emailVerified) {
    throw new AppError('Vérifiez votre adresse e-mail avant de créer votre espace.', 403, 'EMAIL_NOT_VERIFIED');
  }

  const result = await createInTransaction(user.id, user.email, input);
  // Apres commit ; identifiants seulement, jamais le nom ni le telephone.
  logAuditEvent({
    actorUserId: user.id,
    tenantId: result.tenantId,
    actionKey: PERSONAL_SPACE_AUDIT_ACTION,
    entityType: 'Tenant',
    entityId: result.tenantId,
    payload: { tenantId: result.tenantId, userId: user.id, planCode: PACK.PARTICULIER_GRATUIT, country: input.country }
  });
  return result;
}

/**
 * Cree l'espace personnel de `userId` (identifiant tire du jeton, jamais du corps).
 * @returns `replay: true` quand la reponse vient d'un appel anterieur de meme cle.
 */
export async function createPersonalSpace(
  userId: string,
  input: CreatePersonalSpaceInput,
  idempotencyKey?: string
): Promise<{ result: PersonalSpaceResult; replay: boolean }> {
  if (!idempotencyKey) return { result: await createOnce(userId, input), replay: false };

  sweepIdempotency();
  const cacheKey = `${userId}:${idempotencyKey}`;
  const cached = idempotency.get(cacheKey);
  if (cached) return { result: await cached.promise, replay: true };

  const promise = createOnce(userId, input);
  idempotency.set(cacheKey, { promise, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
  try {
    return { result: await promise, replay: false };
  } catch (error) {
    idempotency.delete(cacheKey);
    throw error;
  }
}
