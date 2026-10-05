/**
 * Naissance d'un bon numéroté — lot 040 (spec B4-R1, B4-R3 ; data-model §2.6).
 *
 * Trois natures : bon de réception (`BR`), bon de sortie (`BS`),
 * procès-verbal d'inventaire (`PVI`). Numéro `BR-2026-00042` : préfixe, année
 * de la date du document (UTC, même règle que les pièces de caisse), rang sur
 * cinq chiffres, **continu par agence, nature et année** (unicité en base).
 *
 * Le rang est tiré sous le verrou consultatif `stock-slip` DANS la transaction
 * de l'opération (A10-R3) : une opération annulée ne consomme aucun numéro.
 * Ce verrou est le DERNIER de l'ordre A10-R2 — `createStockSlipTx` le prend
 * lui-même, l'appelant ne le prend jamais.
 *
 * Les libellés métier imprimés sont figés dans `snapshot` à l'émission
 * (B4-R3) : renommer un article ou un preneur ne change pas un bon déjà émis.
 * Aucun montant n'y figure.
 *
 * Le PDF n'est PAS ici : il se régénère à la demande (`stock-bons-pdf.ts`,
 * territoire API-4).
 */

import type { Prisma } from '@prisma/client';

import type { PrismaTransactionClient } from '../../utils/database';
import type { StockSlipKind, StockSlipSnapshot } from './types-040-controle';

/** Préfixes imprimés. */
export const SLIP_PREFIX: Record<StockSlipKind, 'BR' | 'BS' | 'PVI'> = {
  RECEIPT: 'BR',
  ISSUE: 'BS',
  COUNT_REPORT: 'PVI'
};

/** `BR-2026-00042` : calculé, jamais stocké en texte. */
export function formatSlipNumber(kind: StockSlipKind, year: number, number: number): string {
  return `${SLIP_PREFIX[kind]}-${year}-${String(number).padStart(5, '0')}`;
}

/**
 * Crée un bon et tire son numéro. Prend le verrou `stock-slip` de l'agence
 * (forme à deux entiers, espace de clés distinct de celui des pièces de
 * caisse), puis `max(number) + 1` sur `(tenantId, kind, year)`.
 */
export async function createStockSlipTx(
  tx: PrismaTransactionClient,
  input: {
    tenantId: string;
    kind: StockSlipKind;
    documentDate: Date;
    locationId: string;
    siteId?: string | null;
    takerId?: string | null;
    requestedBy?: string | null;
    supplierInvoiceId?: string | null;
    stockCountId?: string | null;
    createdByUserId: string;
    snapshot: StockSlipSnapshot;
  }
): Promise<{ id: string; number: string }> {
  // `$executeRaw` : `pg_advisory_xact_lock` renvoie `void` (voir `cash.ts`).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('stock-slip'), hashtext(${input.tenantId}))`;

  const year = input.documentDate.getUTCFullYear();
  const last = await tx.stockSlip.aggregate({
    where: { tenantId: input.tenantId, kind: input.kind, year },
    _max: { number: true }
  });
  const number = (last._max.number ?? 0) + 1;

  const created = await tx.stockSlip.create({
    data: {
      tenantId: input.tenantId,
      kind: input.kind,
      year,
      number,
      documentDate: input.documentDate,
      locationId: input.locationId,
      siteId: input.siteId ?? null,
      takerId: input.takerId ?? null,
      requestedBy: input.requestedBy ?? null,
      supplierInvoiceId: input.supplierInvoiceId ?? null,
      stockCountId: input.stockCountId ?? null,
      createdByUserId: input.createdByUserId,
      snapshot: input.snapshot as unknown as Prisma.InputJsonValue
    },
    select: { id: true }
  });

  return { id: created.id, number: formatSlipNumber(input.kind, year, number) };
}
