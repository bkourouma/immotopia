import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { hashPassword } from '../utils/password-utils';
import { frontendUrl } from '../config/env';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/error-middleware';
import { COOWNER_CONTACT_IDS_KEY, readCoOwnerContactIds } from '../lib/syndics/coowner-portal';
import { emailService, isEmailDeliveryConfigured } from './email-service';
import { logAuditEvent, recordAuditEvent } from './audit-service';
import { AuditActionKey } from '../types/audit-types';
import { isLanguage } from '../i18n';

/**
 * Invitation au portail copropriétaire, et révocation (côté gestionnaire).
 *
 * ---------------------------------------------------------------------------
 * Ce qui est réutilisé
 * ---------------------------------------------------------------------------
 *
 * Le mécanisme des portails locataire et propriétaire, tel que
 * `getOrCreateTenantClientFromContact` (tenant-service.ts) le pose à la
 * création d'un bail :
 *   - un `User` par adresse e-mail, créé avec un mot de passe jetable que
 *     personne ne connaît, et un `PasswordResetToken` de 7 jours : le lien
 *     `/reset-password?token=...` sert de lien d'activation ;
 *   - un `TenantClient` (utilisateur × agence), dont `details` porte le lien
 *     vers la fiche CRM. Un compte qui n'a encore aucun rattachement dans
 *     l'agence y est créé avec `clientType = CO_OWNER` (valeur de l'énumération
 *     déjà prévue et jusqu'ici inutilisée) ; un propriétaire bailleur ou un
 *     locataire déjà rattaché garde son type, et gagne seulement l'accès au
 *     portail copropriétaire.
 *
 * Le modèle `Invitation` n'est PAS réutilisé : son acceptation crée une
 * adhésion de collaborateur (`Membership`) avec des rôles d'agence — l'exact
 * contraire d'un accès client en lecture seule.
 *
 * ---------------------------------------------------------------------------
 * Pas de lien d'activation pour un compte déjà utilisé
 * ---------------------------------------------------------------------------
 *
 * Le lien d'activation est affiché au gestionnaire (bouton « Copier »). Pour
 * un compte que quelqu'un utilise déjà, en émettre un reviendrait à donner au
 * gestionnaire le moyen de changer le mot de passe de ce compte — qui peut
 * être celui d'un collaborateur, d'un client d'une autre agence, voire d'un
 * super-administrateur. Un nouveau lien d'activation n'est donc émis que
 * pour un compte qui n'a JAMAIS servi (aucune connexion, e-mail jamais
 * vérifié, aucune adhésion, aucun rattachement hors de cette agence,
 * rôle global USER) : c'est le cas d'une invitation précédente restée sans
 * suite. Sinon, le lien affiché est celui de la connexion.
 *
 * Aucun SMS, aucun WhatsApp : l'e-mail est le seul canal automatique.
 */

export type CoOwnerAccountStatus = 'NEW_ACCOUNT' | 'ACTIVATION_RENEWED' | 'EXISTING_ACCOUNT';

export interface CoOwnerPortalInvitationResult {
  email: string;
  contactName: string;
  accountStatus: CoOwnerAccountStatus;
  /** Lien d'activation (compte à activer) ou de connexion (compte existant). */
  invitationUrl: string;
  /** Fin de validité du lien d'activation ; `null` pour un lien de connexion. */
  expiresAt: string | null;
  emailSent: boolean;
  /** Lots du contact ouverts au portail dans l'agence. */
  openedLots: number;
}

export interface CoOwnerPortalRevocationResult {
  closedLots: number;
  unlinkedAccounts: number;
}

const ACTIVATION_VALIDITY_DAYS = 7;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function baseUrl(): string {
  return frontendUrl.replace(/\/$/, '');
}

function contactDisplayName(contact: {
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
  email: string | null;
}): string {
  return (
    `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || contact.legalName?.trim() || contact.email || ''
  );
}

/**
 * Le profil, son lot et son contact — tous trois vérifiés comme appartenant à
 * la copropriété, elle-même vérifiée comme appartenant à l'agence. Toute
 * référence étrangère répond 404, comme un objet inexistant.
 */
async function loadOwnerProfile(tenantId: string, syndicateId: string, ownerProfileId: string) {
  const syndicate = await prisma.syndicate.findFirst({
    where: { id: syndicateId, tenantId },
    select: { id: true }
  });
  if (!syndicate) throw new NotFoundError('Copropriété introuvable.');

  const profile = await prisma.lotOwnerProfile.findFirst({
    where: { id: ownerProfileId },
    select: { id: true, lotId: true, contactId: true, isActive: true }
  });
  if (!profile) throw new NotFoundError('Profil propriétaire introuvable.');

  const lot = await prisma.syndicateLot.findFirst({
    where: { id: profile.lotId, syndicateId: syndicate.id },
    select: { id: true }
  });
  if (!lot) throw new NotFoundError('Profil propriétaire introuvable.');

  const contact = await prisma.crmContact.findFirst({
    where: { id: profile.contactId, tenantId },
    select: { id: true, firstName: true, lastName: true, legalName: true, email: true }
  });
  if (!contact) throw new NotFoundError('Contact introuvable.');

  return { profile, contact };
}

/** Profils du contact dont le lot appartient à une copropriété de l'agence. */
async function contactProfilesInTenant(tenantId: string, contactId: string) {
  const profiles = await prisma.lotOwnerProfile.findMany({
    where: { contactId },
    select: {
      id: true,
      lotId: true,
      isActive: true,
      ownedUntil: true,
      portalAccessEnabled: true,
      portalAccessToken: true
    }
  });
  if (profiles.length === 0) return [];

  const lots = await prisma.syndicateLot.findMany({
    where: { id: { in: Array.from(new Set(profiles.map(profile => profile.lotId))) } },
    select: { id: true, syndicateId: true, lotNumber: true }
  });
  const syndicates = await prisma.syndicate.findMany({
    where: { tenantId, id: { in: Array.from(new Set(lots.map(lot => lot.syndicateId))) } },
    select: { id: true, name: true }
  });
  const syndicateById = new Map(syndicates.map(syndicate => [syndicate.id, syndicate]));
  const lotById = new Map(lots.map(lot => [lot.id, lot]));

  return profiles.flatMap(profile => {
    const lot = lotById.get(profile.lotId);
    const syndicate = lot ? syndicateById.get(lot.syndicateId) : undefined;
    // Lot d'une copropriété d'une autre agence : ignoré, comme s'il n'existait pas.
    if (!lot || !syndicate) return [];
    return [{ ...profile, lotNumber: lot.lotNumber, syndicateName: syndicate.name }];
  });
}

/**
 * Un compte existant peut-il recevoir un NOUVEAU lien d'activation ? Voir
 * l'en-tête : seulement s'il n'a jamais servi et n'est rattaché qu'à cette
 * agence, comme client.
 */
async function canRenewActivation(
  user: {
    id: string;
    globalRole: string;
    emailVerified: boolean;
    lastLoginAt: Date | null;
    googleId: string | null;
  },
  tenantId: string
): Promise<boolean> {
  if (user.globalRole !== 'USER' || user.emailVerified || user.lastLoginAt || user.googleId) return false;
  // Deux comptages plutôt qu'un filtre sur `userId` seul : chacun nomme
  // l'agence (égale, ou différente), ce que le garde-fou Prisma exige.
  const [membershipsHere, membershipsElsewhere, clientsElsewhere] = await Promise.all([
    prisma.membership.count({ where: { userId: user.id, tenantId } }),
    prisma.membership.count({ where: { userId: user.id, tenantId: { not: tenantId } } }),
    prisma.tenantClient.count({ where: { userId: user.id, tenantId: { not: tenantId } } })
  ]);
  return membershipsHere === 0 && membershipsElsewhere === 0 && clientsElsewhere === 0;
}

function activationExpiry(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ACTIVATION_VALIDITY_DAYS);
  return expiresAt;
}

export async function inviteCoOwnerToPortal(params: {
  tenantId: string;
  syndicateId: string;
  ownerProfileId: string;
  actorUserId?: string;
}): Promise<CoOwnerPortalInvitationResult> {
  const { tenantId, syndicateId, ownerProfileId } = params;
  const { profile, contact } = await loadOwnerProfile(tenantId, syndicateId, ownerProfileId);

  if (!profile.isActive) {
    throw new ConflictError("Ce profil propriétaire n'est plus actif : il ne peut pas ouvrir d'accès au portail.");
  }

  const email = contact.email?.trim() ?? '';
  if (!EMAIL_PATTERN.test(email)) {
    throw new BadRequestError(
      "Ce contact n'a pas d'adresse e-mail valide : complétez sa fiche CRM avant de l'inviter au portail."
    );
  }
  const contactName = contactDisplayName(contact);

  const now = new Date();
  const profiles = (await contactProfilesInTenant(tenantId, contact.id)).filter(
    candidate => candidate.isActive && (!candidate.ownedUntil || candidate.ownedUntil.getTime() >= now.getTime())
  );
  if (profiles.length === 0) {
    throw new ConflictError("Ce contact ne détient plus aucun lot dans l'agence : rien à ouvrir au portail.");
  }

  // 1. Le compte : créé, réactivé (jamais servi) ou laissé tel quel.
  let user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      fullName: true,
      globalRole: true,
      emailVerified: true,
      lastLoginAt: true,
      googleId: true,
      isActive: true,
      preferredLanguage: true
    }
  });

  let accountStatus: CoOwnerAccountStatus;
  let activationToken: string | null = null;
  let expiresAt: Date | null = null;

  if (!user) {
    accountStatus = 'NEW_ACCOUNT';
    activationToken = crypto.randomUUID();
    expiresAt = activationExpiry();
    // Mot de passe jetable que personne ne connaît : l'accès passe par le lien.
    const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'));
    const token = activationToken;
    const tokenExpiry = expiresAt;
    user = await prisma.$transaction(async tx => {
      const created = await tx.user.create({
        data: { email, fullName: contactName || null, globalRole: 'USER', passwordHash, emailVerified: false },
        select: {
          id: true,
          fullName: true,
          globalRole: true,
          emailVerified: true,
          lastLoginAt: true,
          googleId: true,
          isActive: true,
          preferredLanguage: true
        }
      });
      await tx.passwordResetToken.create({ data: { token, userId: created.id, expiresAt: tokenExpiry } });
      return created;
    });
  } else {
    if (!user.isActive) {
      throw new ConflictError('Le compte associé à cette adresse e-mail est désactivé.');
    }
    if (await canRenewActivation(user, tenantId)) {
      accountStatus = 'ACTIVATION_RENEWED';
      activationToken = crypto.randomUUID();
      expiresAt = activationExpiry();
      const userId = user.id;
      const token = activationToken;
      const tokenExpiry = expiresAt;
      await prisma.$transaction(async tx => {
        // Comme « mot de passe oublié » : un seul lien valable à la fois.
        await tx.passwordResetToken.updateMany({ where: { userId, used: false }, data: { used: true } });
        await tx.passwordResetToken.create({ data: { token, userId, expiresAt: tokenExpiry } });
      });
    } else {
      accountStatus = 'EXISTING_ACCOUNT';
    }
  }
  const userId = user.id;

  // 2. Le rattachement à l'agence et le lien vers la fiche CRM, puis
  // 3. l'ouverture des lots : une seule unité de travail.
  await prisma.$transaction(async tx => {
    const client = await tx.tenantClient.findFirst({
      where: { userId, tenantId },
      select: { id: true, details: true }
    });
    if (client) {
      const details =
        client.details && typeof client.details === 'object' && !Array.isArray(client.details)
          ? (client.details as Record<string, unknown>)
          : {};
      const contactIds = Array.from(new Set([...readCoOwnerContactIds(details), contact.id]));
      await tx.tenantClient.update({
        where: { id: client.id, tenantId },
        data: {
          details: {
            ...details,
            crmContactId: (details.crmContactId as string | undefined) ?? contact.id,
            [COOWNER_CONTACT_IDS_KEY]: contactIds
          } as Prisma.InputJsonValue
        }
      });
    } else {
      await tx.tenantClient.create({
        data: {
          userId,
          tenantId,
          clientType: 'CO_OWNER',
          details: {
            crmContactId: contact.id,
            [COOWNER_CONTACT_IDS_KEY]: [contact.id],
            source: 'syndic_coowner_portal_invite'
          }
        }
      });
    }

    for (const candidate of profiles) {
      if (candidate.portalAccessEnabled && candidate.portalAccessToken) continue;
      await tx.lotOwnerProfile.update({
        where: { id: candidate.id },
        data: {
          portalAccessEnabled: true,
          portalAccessToken: candidate.portalAccessToken ?? crypto.randomUUID()
        }
      });
    }
  });

  const invitationUrl = activationToken
    ? `${baseUrl()}/reset-password?token=${activationToken}`
    : `${baseUrl()}/login?redirect=${encodeURIComponent('/copropriete')}`;

  // 4. L'e-mail, après écriture : un e-mail parti ne pointe jamais vers une
  // transaction annulée. Son échec n'annule rien — le lien reste affiché.
  let emailSent = false;
  if (isEmailDeliveryConfigured()) {
    try {
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
      await emailService.sendCoOwnerPortalInvitationEmail({
        to: email,
        userName: contactName || user.fullName || email,
        agencyName: tenant?.name ?? '',
        accessUrl: invitationUrl,
        isActivation: Boolean(activationToken),
        lots: profiles.map(candidate => ({ syndicateName: candidate.syndicateName, lotNumber: candidate.lotNumber })),
        tenantId,
        language: isLanguage(user.preferredLanguage) ? user.preferredLanguage : undefined
      });
      emailSent = true;
    } catch (error) {
      logger.warn('Co-owner portal invitation email failed', {
        tenantId,
        contactId: contact.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (params.actorUserId) {
    logAuditEvent({
      actorUserId: params.actorUserId,
      tenantId,
      actionKey: AuditActionKey.SYNDIC_COOWNER_PORTAL_INVITED,
      entityType: 'LotOwnerProfile',
      entityId: profile.id,
      payload: { contactId: contact.id, accountStatus, emailSent, openedLots: profiles.length }
    });
  }

  return {
    email,
    contactName,
    accountStatus,
    invitationUrl,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    emailSent,
    openedLots: profiles.length
  };
}

/**
 * Révoque l'accès au portail du contact d'un profil : TOUS ses lots de
 * l'agence sont refermés, et le contact est retiré de chaque compte de
 * l'agence qui y donnait accès. L'accès est personnel, pas par lot ; pour ne
 * masquer qu'un lot, décocher « Activer accès portail » sur son profil suffit.
 * Le compte utilisateur, lui, n'est pas supprimé : il peut servir ailleurs
 * (bail, autre agence). La garde recalculant le périmètre à chaque requête,
 * la révocation prend effet immédiatement, même sur une session ouverte.
 */
export async function revokeCoOwnerPortalAccess(params: {
  tenantId: string;
  syndicateId: string;
  ownerProfileId: string;
  actorUserId?: string;
}): Promise<CoOwnerPortalRevocationResult> {
  const { tenantId, syndicateId, ownerProfileId } = params;
  const { profile, contact } = await loadOwnerProfile(tenantId, syndicateId, ownerProfileId);
  const profiles = await contactProfilesInTenant(tenantId, contact.id);

  const clients = await prisma.tenantClient.findMany({
    where: { tenantId, details: { path: [COOWNER_CONTACT_IDS_KEY], array_contains: [contact.id] } },
    select: { id: true, details: true }
  });

  await prisma.$transaction(async tx => {
    for (const client of clients) {
      const details = (client.details ?? {}) as Record<string, unknown>;
      await tx.tenantClient.update({
        where: { id: client.id, tenantId },
        data: {
          details: {
            ...details,
            [COOWNER_CONTACT_IDS_KEY]: readCoOwnerContactIds(details).filter(id => id !== contact.id)
          } as Prisma.InputJsonValue
        }
      });
    }
    for (const candidate of profiles) {
      if (!candidate.portalAccessEnabled && !candidate.portalAccessToken) continue;
      await tx.lotOwnerProfile.update({
        where: { id: candidate.id },
        data: { portalAccessEnabled: false, portalAccessToken: null }
      });
    }
    // Critical action: audit trail written in the same transaction.
    if (params.actorUserId) {
      await recordAuditEvent(tx, {
        actorUserId: params.actorUserId,
        tenantId,
        actionKey: AuditActionKey.SYNDIC_COOWNER_PORTAL_REVOKED,
        entityType: 'LotOwnerProfile',
        entityId: profile.id,
        payload: { contactId: contact.id, closedLots: profiles.length, unlinkedAccounts: clients.length }
      });
    }
  });

  return { closedLots: profiles.length, unlinkedAccounts: clients.length };
}
