import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent, recordAuditEvent, AuditWriter } from './audit-service';
import { AuditLogEntry } from '../types/audit-types';

/**
 * Événements d'authentification rattachés aux agences de l'utilisateur
 * (ADR-006, phase 3).
 *
 * Une connexion n'a pas d'agence : l'utilisateur n'a rien choisi, et il peut
 * appartenir à plusieurs. Écrits avec `tenantId: null`, ces événements restaient
 * invisibles de tout journal d'agence, alors que « qui s'est connecté, qui a
 * échoué à se connecter » est exactement ce qu'un administrateur d'agence veut
 * voir. On écrit donc **une ligne par agence active de l'utilisateur** (membre
 * actif ou client de portail) ; sans agence (super-admin, compte neuf), une
 * seule ligne de plateforme. Le `requestId` relie les lignes d'une même
 * connexion.
 */

/** Plafond de lignes par événement : un compte rattaché à des dizaines d'agences ne multiplie pas le journal. */
const MAX_TENANTS = 10;

interface TenantReader {
  membership: { findMany: (args: any) => Promise<Array<{ tenantId: string }>> };
  tenantClient: { findMany: (args: any) => Promise<Array<{ tenantId: string }>> };
}

export type AuthAuditEntry = Omit<AuditLogEntry, 'tenantId'> & { actorUserId: string };

/** Agences où l'utilisateur est membre actif ou client de portail, au plus `MAX_TENANTS`. */
export async function tenantIdsOfUser(userId: string, db: TenantReader = prisma as unknown as TenantReader) {
  const [memberships, clients] = await Promise.all([
    db.membership.findMany({ where: { userId, status: 'ACTIVE' }, select: { tenantId: true }, take: MAX_TENANTS }),
    db.tenantClient.findMany({ where: { userId }, select: { tenantId: true }, take: MAX_TENANTS })
  ]);
  return [...new Set([...memberships, ...clients].map(row => row.tenantId))].slice(0, MAX_TENANTS);
}

function fanOut(entry: AuthAuditEntry, tenantIds: string[]): AuditLogEntry[] {
  return tenantIds.length > 0 ? tenantIds.map(tenantId => ({ ...entry, tenantId })) : [{ ...entry, tenantId: null }];
}

/**
 * Journalise un événement d'authentification (file asynchrone). Ne bloque pas
 * la connexion et n'échoue jamais : si les agences ne peuvent pas être
 * déterminées, l'événement est écrit sans agence plutôt que perdu.
 *
 * À appeler sans `await` depuis un flux d'authentification : le contexte de
 * requête (IP, navigateur) survit aux `await` internes.
 */
export async function logAuthEvent(entry: AuthAuditEntry): Promise<void> {
  let tenantIds: string[] = [];
  try {
    tenantIds = await tenantIdsOfUser(entry.actorUserId);
  } catch (error) {
    logger.warn('Audit auth: agences de l’utilisateur indisponibles, événement écrit sans agence', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
  for (const row of fanOut(entry, tenantIds)) {
    logAuditEvent(row);
  }
}

/**
 * Variante transactionnelle, pour les événements critiques (réutilisation d'un
 * jeton de session, fin de réinitialisation du mot de passe) : écrite dans la
 * transaction de l'effet, qui échoue avec elle.
 */
export async function recordAuthEvent(tx: AuditWriter & TenantReader, entry: AuthAuditEntry): Promise<void> {
  const tenantIds = await tenantIdsOfUser(entry.actorUserId, tx);
  for (const row of fanOut(entry, tenantIds)) {
    await recordAuditEvent(tx, row);
  }
}
