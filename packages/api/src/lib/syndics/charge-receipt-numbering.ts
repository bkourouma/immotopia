import type { PrismaTransactionClient } from '../../utils/database';

/**
 * Numérotation des reçus et quittances de charges (lot S3).
 *
 * Une série par émetteur (identifiant du mandant, ou `AGENCY`), par type et
 * par année : `Q-2026-000123` (quittance), `R-2026-000045` (reçu). Continue et
 * sans trou : le compteur est incrémenté DANS la transaction d'émission, par
 * un `INSERT … ON CONFLICT DO UPDATE … RETURNING` qui verrouille la ligne de
 * la série jusqu'à la fin de la transaction (même idiome que
 * `nextPlatformInvoiceNumberTx`) ; deux émissions concurrentes se suivent, et
 * une émission annulée (rollback) rend son numéro.
 */

export type ChargeReceiptKind = 'RECEIPT' | 'QUITTANCE';

/** Émetteur « agence » (copropriété sans mandant). */
export const AGENCY_ISSUER_KEY = 'AGENCY';

const PREFIX: Record<ChargeReceiptKind, string> = { QUITTANCE: 'Q', RECEIPT: 'R' };

export function formatChargeReceiptNumber(kind: ChargeReceiptKind, year: number, value: number): string {
  return `${PREFIX[kind]}-${year}-${String(value).padStart(6, '0')}`;
}

/** Année de numérotation d'un document émis à `issuedAt` (UTC, comme les factures plateforme). */
export function numberingYear(issuedAt: Date): number {
  return issuedAt.getUTCFullYear();
}

export async function nextChargeReceiptNumberTx(
  tx: PrismaTransactionClient,
  args: { tenantId: string; issuerKey: string; kind: ChargeReceiptKind; issuedAt: Date }
): Promise<string> {
  const year = numberingYear(args.issuedAt);
  const rows = await tx.$queryRaw<Array<{ last_value: number }>>`
    INSERT INTO syndic_receipt_sequences (tenant_id, issuer_key, kind, year, last_value, updated_at)
    VALUES (${args.tenantId}, ${args.issuerKey}, ${args.kind}::"SyndicChargeReceiptKind", ${year}, 1, NOW())
    ON CONFLICT (tenant_id, issuer_key, kind, year) DO UPDATE
      SET last_value = syndic_receipt_sequences.last_value + 1, updated_at = NOW()
    RETURNING last_value`;
  return formatChargeReceiptNumber(args.kind, year, Number(rows[0].last_value));
}
