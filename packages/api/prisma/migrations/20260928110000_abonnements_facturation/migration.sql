-- Abonnements par packs, vague 3 lot A : facturation automatique des
-- abonnements (docs/architecture/PLAN-ABONNEMENTS.md, §6 quater). Additive.

-- Statut « en retard » des factures PLATFORM. (ADD VALUE : la valeur n'est
-- pas utilisee dans cette migration.)
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'OVERDUE';

CREATE TYPE "PlatformInvoiceNature" AS ENUM ('PERIOD', 'OVERAGE', 'CREDIT_NOTE');

ALTER TABLE "invoices"
  ADD COLUMN "billing_nature" "PlatformInvoiceNature",
  ADD COLUMN "issued_at" TIMESTAMP(3),
  ADD COLUMN "sent_at" TIMESTAMP(3),
  ADD COLUMN "payment_method" TEXT,
  ADD COLUMN "payment_reference" TEXT,
  ADD COLUMN "canceled_at" TIMESTAMP(3),
  ADD COLUMN "cancel_reason" TEXT,
  ADD COLUMN "credited_invoice_id" TEXT,
  ADD COLUMN "issuer_snapshot" JSONB,
  ADD COLUMN "customer_snapshot" JSONB;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_credited_invoice_id_fkey" FOREIGN KEY ("credited_invoice_id")
  REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "invoices_credited_invoice_id_idx" ON "invoices"("credited_invoice_id");

-- Idempotence : jamais deux factures vivantes pour la meme agence, la meme
-- nature et le meme debut de periode (une facture annulee par avoir libere
-- la place pour une facture corrigee).
CREATE UNIQUE INDEX "invoices_platform_period_key"
  ON "invoices"("tenant_id", "billing_nature", "period_start")
  WHERE "kind" = 'PLATFORM'
    AND "billing_nature" IN ('PERIOD', 'OVERAGE')
    AND "status" <> 'CANCELED';

-- Un avoir au plus par facture.
CREATE UNIQUE INDEX "invoices_credit_note_key"
  ON "invoices"("credited_invoice_id")
  WHERE "billing_nature" = 'CREDIT_NOTE';

-- Numerotation continue IMT-AAAA-NNNNN (globale, par annee).
CREATE TABLE "platform_invoice_sequences" (
  "year" INTEGER NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_invoice_sequences_pkey" PRIMARY KEY ("year")
);
