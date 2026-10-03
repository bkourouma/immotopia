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
 * `TenantClient` : ce service les crée à partir du contact, de façon
 * idempotente, avec l'utilitaire déjà utilisé à la création d'un bail
 * (`getOrCreateTenantClientFromContact`, tenant-service).
 *
 * BUG-2026-09-28-019.
 */

/** Rôle CRM qui fait d'un contact un propriétaire. */
export const OWNER_CONTACT_ROLE = 'PROPRIETAIRE';

/**
 * Garantit le `TenantClient` OWNER d'un contact de l'agence. Idempotent : un
 * client déjà présent (même compte, même agence) est réutilisé, jamais dupliqué.
 *
 * @throws NotFoundError si le contact n'appartient pas à `tenantId` (même
 *         erreur qu'un contact inexistant).
 */
export async function ensureOwnerClientForContact(tenantId: string, contactId: string) {
  await assertBelongsToTenant(prisma, 'crmContact', contactId, tenantId, { message: 'Contact introuvable.' });
  const { getOrCreateTenantClientFromContact } = await import('./tenant-service');
  const result = await getOrCreateTenantClientFromContact(tenantId, contactId, 'OWNER');
  return result.tenantClient;
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
 * Rattrapage : crée le `TenantClient` OWNER de chaque contact de l'agence qui
 * porte un rôle Propriétaire actif (contacts convertis avant que la
 * conversion ne le fasse). Idempotent ; c'est une écriture, donc exposée en
 * POST explicite. Un contact en échec n'empêche pas les autres.
 *
 * @returns nombre de contacts propriétaires examinés et de clients créés.
 */
export async function syncOwnerClients(tenantId: string): Promise<{ examined: number; created: number }> {
  const contacts = await prisma.crmContact.findMany({
    where: {
      tenantId,
      roles: { some: { tenantId, role: OWNER_CONTACT_ROLE as never, active: true } }
    },
    select: { id: true, email: true }
  });
  if (contacts.length === 0) return { examined: 0, created: 0 };

  const { getOrCreateTenantClientFromContact } = await import('./tenant-service');
  let created = 0;
  for (const contact of contacts) {
    try {
      const user = await prisma.user.findUnique({ where: { email: contact.email }, select: { id: true } });
      const existing = user
        ? await prisma.tenantClient.findUnique({
            where: { userId_tenantId: { userId: user.id, tenantId } },
            select: { id: true }
          })
        : null;
      await getOrCreateTenantClientFromContact(tenantId, contact.id, 'OWNER');
      if (!existing) created += 1;
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
