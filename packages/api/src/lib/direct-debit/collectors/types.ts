import type { Prisma } from '@prisma/client';

/**
 * Encaisseurs de prélèvements (spec 042, P3, data-model §8.6) : un par
 * périmètre. P3 livre RENTAL_LEASE ; P4 livrera SYNDIC_LOT derrière la même
 * interface.
 */

export type Tx = Prisma.TransactionClient;

export type CollectorScope = 'RENTAL_LEASE' | 'SYNDIC_LOT';

/** Ligne chargée par le service, filtrée par agence. */
export interface CollectorLine {
  id: string;
  tenantId: string;
  remittanceId: string;
  reference: string;
  mandateId: string;
  amount: number;
  scope: CollectorScope;
  // RENTAL_LEASE
  leaseId: string | null;
  installmentId: string | null;
  // SYNDIC_LOT (P4)
  lotId: string | null;
  chargeCallIds: string[];
  syndicateId: string | null;
  rentalPaymentId: string | null;
  chargePaymentId: string | null;
  /** Compte de trésorerie du créancier. */
  treasuryAccountId: string | null;
}

export interface CollectorContext {
  tenantId: string;
  actorUserId: string | null;
  now: Date;
}

export interface DirectDebitCollector {
  scope: CollectorScope;
  keepsActiveKeyOnSettle: boolean;
  settleTx(
    tx: Tx,
    ctx: CollectorContext,
    line: CollectorLine,
    settledAt: Date
  ): Promise<{ rentalPaymentId?: string; chargePaymentId?: string; afterCommit?: () => Promise<void> }>;
  reverseTx(tx: Tx, ctx: CollectorContext, line: CollectorLine): Promise<{ afterCommit?: () => Promise<void> }>;
  applyRejectFeeTx(tx: Tx, ctx: CollectorContext, line: CollectorLine, fee: number): Promise<{ appliedAmount: number }>;
}
