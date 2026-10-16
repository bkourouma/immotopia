import { prisma } from '../../utils/database';
import { decryptIban, encryptIban, isIbanEncryptionAvailable, needsIbanReencryption } from './iban-crypto';

/**
 * Rechiffrement des IBAN des mandats vers la clé courante
 * (`DIRECT_DEBIT_IBAN_KEY`) — rotation de clé ou sortie de l'ancien format
 * `pg1` (spec 042, PB2-R4).
 *
 * Idempotent : une valeur déjà sur la clé courante n'est jamais touchée, une
 * deuxième exécution rechiffre donc 0 mandat. Parcourt TOUS les mandats (toutes
 * agences, tous statuts, révoqués compris). N'expose que des compteurs et des
 * identifiants de mandats : ni IBAN, ni texte chiffré, ni clé.
 */

export interface ReencryptionResult {
  scanned: number;
  alreadyCurrent: number;
  /** En dry-run : nombre de mandats qui SERAIENT rechiffrés (rien n'est écrit). */
  reencrypted: number;
  unreadableIds: string[];
  /** Mandats dont la valeur a changé entre la lecture et l'écriture (0 ligne mise à jour). */
  changedConcurrently: number;
}

export class IbanReencryptionConfigError extends Error {}

const DEFAULT_BATCH_SIZE = 200;

export async function reencryptMandateIbans(options: {
  dryRun: boolean;
  batchSize?: number;
}): Promise<ReencryptionResult> {
  if (!isIbanEncryptionAvailable()) {
    throw new IbanReencryptionConfigError(
      'DIRECT_DEBIT_IBAN_KEY est absente ou invalide : le rechiffrement a besoin de la clé courante.'
    );
  }
  const batchSize = options.batchSize && options.batchSize > 0 ? Math.floor(options.batchSize) : DEFAULT_BATCH_SIZE;
  const result: ReencryptionResult = {
    scanned: 0,
    alreadyCurrent: 0,
    reencrypted: 0,
    unreadableIds: [],
    changedConcurrently: 0
  };

  let lastId: string | null = null;
  for (;;) {
    const rows: Array<{ id: string; ibanEncrypted: string }> = await prisma.directDebitMandate.findMany({
      where: lastId ? { id: { gt: lastId } } : {},
      orderBy: { id: 'asc' },
      take: batchSize,
      select: { id: true, ibanEncrypted: true }
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      result.scanned += 1;
      if (!needsIbanReencryption(row.ibanEncrypted)) {
        result.alreadyCurrent += 1;
        continue;
      }
      let renewed: string;
      try {
        const plain = decryptIban(row.ibanEncrypted);
        renewed = encryptIban(plain);
        if (decryptIban(renewed) !== plain) throw new Error('round-trip');
      } catch {
        result.unreadableIds.push(row.id);
        continue;
      }
      if (options.dryRun) {
        result.reencrypted += 1;
        continue;
      }
      const updated = await prisma.directDebitMandate.updateMany({
        where: { id: row.id, ibanEncrypted: row.ibanEncrypted },
        data: { ibanEncrypted: renewed }
      });
      if (updated.count === 0) result.changedConcurrently += 1;
      else result.reencrypted += 1;
    }

    lastId = rows[rows.length - 1].id;
    if (rows.length < batchSize) break;
  }
  return result;
}
