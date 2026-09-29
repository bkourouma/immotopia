import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { assertBelongsToTenant } from '../utils/tenant-ownership';
import { NotFoundError } from '../middleware/error-middleware';

/**
 * Propriétaires « clients » de l'agence (`TenantClient` de type OWNER).
 *
 * Un contact CRM converti en client avec le rôle Propriétaire doit être
 * proposé partout où l'on désigne un propriétaire (vendeur d'un mandat de
 * vente, propriétaire d'un bien, indivision). Ces écrans lisent les
 * `TenantClient` : ce service les rattache au contact, de façon idempotente.
 *
 * SÉCURITÉ. Ce rattachement n'émet JAMAIS de jeton de connexion ni de
 * notification (WhatsApp, e-mail). Un contact sans compte reçoit un compte
 * « dormant » : mot de passe aléatoire que personne ne connaît, e-mail non
 * vérifié, aucun jeton de réinitialisation. Ce compte ne peut être activé que
 * par le titulaire réel de l'adresse (« mot de passe oublié » envoyé à
 * l'e-mail lui-même) ; l'agence n'en obtient aucun lien. Créer le compte avec
 * un lien remis à un numéro saisi par l'agence permettait à un collaborateur de
 * prendre le compte d'un tiers. `TenantClient` exige un `userId` : le compte
 * dormant est ce qui permet de lister le contact comme propriétaire.
 *
 * BUG-2026-09-28-019.
 */

/** Rôle CRM qui fait d'un contact un propriétaire. */
export const OWNER_CONTACT_ROLE = 'PROPRIETAIRE';

/**
 * Rattache le `TenantClient` OWNER d'un contact de l'agence à son compte
 * (existant, sinon dormant). Idempotent : un client déjà présent (même compte,
 * même agence) est réutilisé, jamais dupliqué.
 *
 * @throws NotFoundError si le contact n'appartient pas à `tenantId` (même
 *         erreur qu'un contact inexistant).
 */
export async function ensureOwnerClientForContact(
  tenantId: string,
  contactId: string
): Promise<{ id: string; created: boolean } | null> {
  await assertBelongsToTenant(prisma, 'crmContact', contactId, tenantId, { message: 'Contact introuvable.' });
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId },
    select: { id: true, email: true, phonePrimary: true, firstName: true, lastName: true }
  });
  if (!contact) throw new NotFoundError('Contact introuvable.');

  let user = await prisma.user.findUnique({ where: { email: contact.email }, select: { id: true } });
  if (!user) {
    // Compte dormant : voir l'en-tête du fichier (aucun jeton, aucune notification).
    const unknownPassword = crypto.randomBytes(32).toString('base64url');
    user = await prisma.user.create({
      data: {
        email: contact.email,
        fullName: [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || contact.email,
        globalRole: 'USER',
        passwordHash: await bcrypt.hash(unknownPassword, 10),
        emailVerified: false
      },
      select: { id: true }
    });
    logger.info('Dormant user account created for owner contact', { userId: user.id, contactId: contact.id });
  }

  const key = { userId_tenantId: { userId: user.id, tenantId } };
  const existing = await prisma.tenantClient.findUnique({
    where: key,
    select: { id: true, details: true }
  });
  if (existing) {
    const details = (existing.details as Record<string, unknown> | null) ?? {};
    if (!details.crmContactId) {
      await prisma.tenantClient.update({
        where: { id: existing.id },
        data: { details: { ...details, crmContactId: contact.id } as never },
        select: { id: true }
      });
    }
    return { id: existing.id, created: false };
  }

  const created = await prisma.tenantClient.create({
    data: {
      userId: user.id,
      tenantId,
      clientType: 'OWNER',
      details: {
        crmContactId: contact.id,
        phone: contact.phonePrimary,
        source: 'crm_contact',
        autoCreated: true
      }
    },
    select: { id: true }
  });
  return { id: created.id, created: true };
}

/**
 * Appelée à la conversion et à l'ajout de rôle : ne fait rien sans le rôle
 * Propriétaire. Un échec est journalisé sans annuler la conversion déjà
 * enregistrée — le rattrapage `syncOwnerClients` reprend le contact.
 */
export async function ensureOwnerClientIfOwnerRole(
  tenantId: string,
  contactId: string,
  roles: readonly string[]
): Promise<void> {
  if (!roles.includes(OWNER_CONTACT_ROLE)) return;
  try {
    await ensureOwnerClientForContact(tenantId, contactId);
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    logger.warn('Owner TenantClient creation failed after role change', {
      tenantId,
      contactId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Rattrapage explicite : rattache le `TenantClient` OWNER de chaque contact de
 * l'agence qui porte un rôle Propriétaire actif (compte dormant si l'e-mail n'a
 * pas de compte ; jamais de jeton, jamais de notification).
 * Idempotent ; c'est une écriture, donc exposée en POST, sous la permission
 * `CRM_CONTACTS_EDIT`. Un contact en échec n'empêche pas les autres.
 *
 * @returns nombre de contacts propriétaires examinés et de clients créés.
 */
export async function syncOwnerClients(tenantId: string): Promise<{ examined: number; created: number }> {
  const contacts = await prisma.crmContact.findMany({
    where: {
      tenantId,
      roles: { some: { tenantId, role: OWNER_CONTACT_ROLE as never, active: true } }
    },
    select: { id: true }
  });
  if (contacts.length === 0) return { examined: 0, created: 0 };

  let created = 0;
  for (const contact of contacts) {
    try {
      const result = await ensureOwnerClientForContact(tenantId, contact.id);
      if (result?.created) created += 1;
    } catch (error) {
      logger.warn('Owner TenantClient sync failed for contact', {
        tenantId,
        contactId: contact.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return { examined: contacts.length, created };
}
