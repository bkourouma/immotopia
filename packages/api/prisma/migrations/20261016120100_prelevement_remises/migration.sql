-- Spec 042 P2 : remises de prélèvements et leurs lignes.
-- CreateEnum
CREATE TYPE "DirectDebitRemittanceStatus" AS ENUM ('DRAFT', 'VALIDATED', 'EXPORTED', 'SUBMITTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "DirectDebitRemittanceLineStatus" AS ENUM ('PENDING', 'CANCELED');

-- CreateEnum
CREATE TYPE "DirectDebitPrenotificationStatus" AS ENUM ('PENDING', 'SENT', 'NO_EMAIL', 'DISABLED', 'FAILED');

-- CreateTable
CREATE TABLE "direct_debit_remittances" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "scope" "DirectDebitMandateScope" NOT NULL DEFAULT 'RENTAL_LEASE',
    "creditor_id" UUID NOT NULL,
    "status" "DirectDebitRemittanceStatus" NOT NULL DEFAULT 'DRAFT',
    "collection_date" DATE NOT NULL,
    "prenotification_deadline" DATE NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "line_count" INTEGER NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "file_format" "DirectDebitFileFormat",
    "creditor_label_snapshot" TEXT,
    "creditor_identifier_snapshot" TEXT,
    "validated_at" TIMESTAMP(3),
    "validated_by_user_id" TEXT,
    "first_exported_at" TIMESTAMP(3),
    "last_exported_at" TIMESTAMP(3),
    "export_count" INTEGER NOT NULL DEFAULT 0,
    "last_file_digest" TEXT,
    "submitted_at" TIMESTAMP(3),
    "submitted_by_user_id" TEXT,
    "canceled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_debit_remittances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_debit_remittance_lines" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "remittance_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "mandate_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "debtor_client_id" TEXT NOT NULL,
    "status" "DirectDebitRemittanceLineStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "remaining_due_at_selection" DECIMAL(12,2) NOT NULL,
    "capped" BOOLEAN NOT NULL DEFAULT false,
    "active_key" TEXT,
    "canceled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "prenotification_status" "DirectDebitPrenotificationStatus" NOT NULL DEFAULT 'PENDING',
    "prenotified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_debit_remittance_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "direct_debit_remittances_tenant_id_status_idx" ON "direct_debit_remittances"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "direct_debit_remittances_creditor_id_idx" ON "direct_debit_remittances"("creditor_id");

-- CreateIndex
CREATE UNIQUE INDEX "direct_debit_remittances_tenant_id_year_sequence_key" ON "direct_debit_remittances"("tenant_id", "year", "sequence");

-- CreateIndex
CREATE INDEX "direct_debit_remittance_lines_tenant_id_status_idx" ON "direct_debit_remittance_lines"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "direct_debit_remittance_lines_mandate_id_idx" ON "direct_debit_remittance_lines"("mandate_id");

-- CreateIndex
CREATE INDEX "direct_debit_remittance_lines_installment_id_idx" ON "direct_debit_remittance_lines"("installment_id");

-- CreateIndex
CREATE INDEX "direct_debit_remittance_lines_lease_id_idx" ON "direct_debit_remittance_lines"("lease_id");

-- CreateIndex
CREATE UNIQUE INDEX "direct_debit_remittance_lines_remittance_id_line_number_key" ON "direct_debit_remittance_lines"("remittance_id", "line_number");

-- CreateIndex
CREATE UNIQUE INDEX "direct_debit_remittance_lines_tenant_id_active_key_key" ON "direct_debit_remittance_lines"("tenant_id", "active_key");

-- AddForeignKey
ALTER TABLE "direct_debit_remittances" ADD CONSTRAINT "direct_debit_remittances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_remittances" ADD CONSTRAINT "direct_debit_remittances_creditor_id_fkey" FOREIGN KEY ("creditor_id") REFERENCES "direct_debit_creditors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_remittance_lines" ADD CONSTRAINT "direct_debit_remittance_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_remittance_lines" ADD CONSTRAINT "direct_debit_remittance_lines_remittance_id_fkey" FOREIGN KEY ("remittance_id") REFERENCES "direct_debit_remittances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_remittance_lines" ADD CONSTRAINT "direct_debit_remittance_lines_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "direct_debit_mandates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_remittance_lines" ADD CONSTRAINT "direct_debit_remittance_lines_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_remittance_lines" ADD CONSTRAINT "direct_debit_remittance_lines_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_remittance_lines" ADD CONSTRAINT "direct_debit_remittance_lines_debtor_client_id_fkey" FOREIGN KEY ("debtor_client_id") REFERENCES "tenant_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
