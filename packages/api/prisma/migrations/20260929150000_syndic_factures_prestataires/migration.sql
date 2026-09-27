-- Syndic S6 : factures et paiements des prestataires d'une copropriete,
-- journal des mouvements des fonds (lib/syndics/provider-invoices.ts).

-- CreateEnum
CREATE TYPE "SyndicProviderInvoiceStatus" AS ENUM ('RECORDED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SyndicFundMovementDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "SyndicFundMovementSource" AS ENUM ('MANUAL_ADJUSTMENT', 'PROVIDER_PAYMENT', 'PROVIDER_PAYMENT_REVERSAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SourceType" ADD VALUE 'PROVIDER_INVOICE';
ALTER TYPE "SourceType" ADD VALUE 'PROVIDER_PAYMENT';

-- CreateTable
CREATE TABLE "syndic_provider_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "syndicate_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "contract_id" UUID,
    "incident_id" UUID,
    "budget_line_item_id" UUID,
    "fund_id" UUID,
    "number" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3),
    "amount_ht" DECIMAL(14,2) NOT NULL,
    "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_ttc" DECIMAL(14,2) NOT NULL,
    "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "expense_account_id" UUID,
    "file_path" TEXT,
    "file_name" TEXT,
    "status" "SyndicProviderInvoiceStatus" NOT NULL DEFAULT 'RECORDED',
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "journal_entry_id" UUID,
    "cancel_entry_id" UUID,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syndic_provider_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndic_provider_payments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" UUID NOT NULL,
    "fund_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "journal_entry_id" UUID,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "cancel_entry_id" UUID,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syndic_provider_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndicate_fund_movements" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "fund_id" UUID NOT NULL,
    "direction" "SyndicFundMovementDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance_after" DECIMAL(14,2) NOT NULL,
    "label" TEXT NOT NULL,
    "source_type" "SyndicFundMovementSource" NOT NULL,
    "source_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syndicate_fund_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "syndic_provider_invoices_tenant_id_idx" ON "syndic_provider_invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "syndic_provider_invoices_syndicate_id_status_idx" ON "syndic_provider_invoices"("syndicate_id", "status");

-- CreateIndex
CREATE INDEX "syndic_provider_invoices_syndicate_id_provider_id_idx" ON "syndic_provider_invoices"("syndicate_id", "provider_id");

-- CreateIndex
CREATE INDEX "syndic_provider_invoices_contract_id_idx" ON "syndic_provider_invoices"("contract_id");

-- CreateIndex
CREATE INDEX "syndic_provider_invoices_incident_id_idx" ON "syndic_provider_invoices"("incident_id");

-- CreateIndex
CREATE INDEX "syndic_provider_invoices_budget_line_item_id_idx" ON "syndic_provider_invoices"("budget_line_item_id");

-- CreateIndex
CREATE INDEX "syndic_provider_invoices_fund_id_idx" ON "syndic_provider_invoices"("fund_id");

-- CreateIndex
CREATE INDEX "syndic_provider_payments_tenant_id_idx" ON "syndic_provider_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "syndic_provider_payments_invoice_id_idx" ON "syndic_provider_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "syndic_provider_payments_fund_id_idx" ON "syndic_provider_payments"("fund_id");

-- CreateIndex
CREATE INDEX "syndicate_fund_movements_tenant_id_idx" ON "syndicate_fund_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "syndicate_fund_movements_fund_id_created_at_idx" ON "syndicate_fund_movements"("fund_id", "created_at");

-- CreateIndex
CREATE INDEX "syndicate_fund_movements_source_type_source_id_idx" ON "syndicate_fund_movements"("source_type", "source_id");

-- AddForeignKey
ALTER TABLE "syndic_provider_invoices" ADD CONSTRAINT "syndic_provider_invoices_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_provider_invoices" ADD CONSTRAINT "syndic_provider_invoices_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "service_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_provider_invoices" ADD CONSTRAINT "syndic_provider_invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "maintenance_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_provider_invoices" ADD CONSTRAINT "syndic_provider_invoices_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "syndicate_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_provider_invoices" ADD CONSTRAINT "syndic_provider_invoices_budget_line_item_id_fkey" FOREIGN KEY ("budget_line_item_id") REFERENCES "budget_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_provider_invoices" ADD CONSTRAINT "syndic_provider_invoices_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "syndicate_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_provider_payments" ADD CONSTRAINT "syndic_provider_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "syndic_provider_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_provider_payments" ADD CONSTRAINT "syndic_provider_payments_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "syndicate_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_fund_movements" ADD CONSTRAINT "syndicate_fund_movements_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "syndicate_funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Unicite du numero de facture d'un prestataire dans une copropriete, hors
-- factures annulees : une facture annulee (erreur de saisie) doit pouvoir etre
-- ressaisie sous le meme numero. Index PARTIEL, que le DSL Prisma ne sait pas
-- exprimer (meme cas que "chart_of_accounts_syndicate_account_number_key").
CREATE UNIQUE INDEX IF NOT EXISTS "syndic_provider_invoices_active_number_key"
    ON "syndic_provider_invoices"("syndicate_id", "provider_id", "number")
 WHERE "status" <> 'CANCELLED';
