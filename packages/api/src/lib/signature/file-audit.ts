import { prisma } from '../../utils/database';
import { AuditActionKey, recordAuditEvent } from '../../services/audit-service';
import { findSignatureSource } from './sources';

/**
 * Audit des lectures de PDF (spec 042 §10.2 SIG-S5 et §10.7). Pour une source qui active
 * `codeBeforeView`, le PDF porte des données sensibles (IBAN complet) : chaque envoi, côté
 * signataire comme côté agence, est tracé AVANT l'envoi du fichier, et un échec d'écriture
 * bloque l'envoi (l'exception remonte au contrôleur).
 *
 * Choix : une table de correspondance « type de document -> clé d'audit » ici, plutôt qu'une
 * option de source (le contrat `sources/types.ts` reste inchangé) ou un crochet codé en dur
 * dans les contrôleurs. Un type sans entrée, ou dont la source n'active pas `codeBeforeView`,
 * n'écrit rien. Le payload ne porte jamais d'IBAN ni de contenu du PDF.
 */
const FILE_READ_AUDIT: Record<string, { actionKey: AuditActionKey; entityType: string }> = {
  DIRECT_DEBIT_MANDATE: {
    actionKey: AuditActionKey.DIRECT_DEBIT_MANDATE_AUTHORIZATION_DOWNLOADED,
    entityType: 'DirectDebitMandate'
  },
  SYNDIC_DIRECT_DEBIT_MANDATE: {
    actionKey: AuditActionKey.DIRECT_DEBIT_MANDATE_AUTHORIZATION_DOWNLOADED,
    entityType: 'DirectDebitMandate'
  }
};

export type ServedFile = {
  tenantId: string;
  requestId: string;
  kind: string;
  /** Identifiant du document cible dans son module (le mandat). */
  targetId: string;
  channel: 'SIGNER' | 'AGENCY';
  variant: 'source' | 'signed' | 'evidence';
  signerId?: string | null;
  actorUserId?: string | null;
};

/** À appeler AVANT d'envoyer le PDF. Ne fait rien pour un type ordinaire. */
export async function auditSignatureFileServed(file: ServedFile): Promise<void> {
  const mapping = FILE_READ_AUDIT[file.kind];
  if (!mapping || !findSignatureSource(file.kind)?.codeBeforeView) return;
  await recordAuditEvent(prisma, {
    tenantId: file.tenantId,
    actorUserId: file.actorUserId ?? null,
    ...(file.channel === 'SIGNER' ? { actorType: 'PORTAL' as const } : {}),
    actionKey: mapping.actionKey,
    entityType: mapping.entityType,
    entityId: file.targetId,
    payload: {
      channel: file.channel,
      variant: file.variant,
      requestId: file.requestId,
      signerId: file.signerId ?? null
    }
  });
}
