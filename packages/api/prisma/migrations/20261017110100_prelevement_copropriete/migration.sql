-- Spec 042 P4 (copropriete) : prelevement des appels de charges (data-model.md section 9.2).
-- Additive : colonnes facultatives, champs locatifs devenus facultatifs, index et cles etrangeres.

-- AlterTable
ALTER TABLE "direct_debit_creditors" ADD COLUMN     "bank_account_ref" TEXT,
ADD COLUMN     "bank_name" TEXT,
ADD COLUMN     "scope" "DirectDebitMandateScope" NOT NULL DEFAULT 'RENTAL_LEASE',
ADD COLUMN     "syndicate_id" UUID,
ALTER COLUMN "treasury_account_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "direct_debit_mandates" ADD COLUMN     "debtor_contact_id" TEXT,
ADD COLUMN     "lot_id" UUID,
ADD COLUMN     "syndicate_id" UUID,
ALTER COLUMN "debtor_client_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "direct_debit_remittances" ADD COLUMN     "syndicate_id" UUID;

-- AlterTable
ALTER TABLE "direct_debit_remittance_lines" ADD COLUMN     "charge_call_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "charge_payment_id" UUID,
ADD COLUMN     "debtor_contact_id" TEXT,
ADD COLUMN     "lot_id" UUID,
ALTER COLUMN "lease_id" DROP NOT NULL,
ALTER COLUMN "installment_id" DROP NOT NULL,
ALTER COLUMN "debtor_client_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "direct_debit_return_imports" ADD COLUMN     "syndicate_id" UUID;

-- CreateIndex
CREATE INDEX "direct_debit_creditors_tenant_id_scope_idx" ON "direct_debit_creditors"("tenant_id", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "direct_debit_creditors_tenant_id_syndicate_id_key" ON "direct_debit_creditors"("tenant_id", "syndicate_id");

-- CreateIndex
CREATE INDEX "direct_debit_mandates_tenant_id_scope_idx" ON "direct_debit_mandates"("tenant_id", "scope");

-- CreateIndex
CREATE INDEX "direct_debit_mandates_lot_id_idx" ON "direct_debit_mandates"("lot_id");

-- CreateIndex
CREATE INDEX "direct_debit_remittances_tenant_id_scope_idx" ON "direct_debit_remittances"("tenant_id", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "direct_debit_remittance_lines_charge_payment_id_key" ON "direct_debit_remittance_lines"("charge_payment_id");

-- CreateIndex
CREATE INDEX "direct_debit_remittance_lines_lot_id_idx" ON "direct_debit_remittance_lines"("lot_id");

-- AddForeignKey
ALTER TABLE "direct_debit_creditors" ADD CONSTRAINT "direct_debit_creditors_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_mandates" ADD CONSTRAINT "direct_debit_mandates_debtor_contact_id_fkey" FOREIGN KEY ("debtor_contact_id") REFERENCES "crm_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_mandates" ADD CONSTRAINT "direct_debit_mandates_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_mandates" ADD CONSTRAINT "direct_debit_mandates_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_remittances" ADD CONSTRAINT "direct_debit_remittances_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_remittance_lines" ADD CONSTRAINT "direct_debit_remittance_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_remittance_lines" ADD CONSTRAINT "direct_debit_remittance_lines_debtor_contact_id_fkey" FOREIGN KEY ("debtor_contact_id") REFERENCES "crm_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_remittance_lines" ADD CONSTRAINT "direct_debit_remittance_lines_charge_payment_id_fkey" FOREIGN KEY ("charge_payment_id") REFERENCES "charge_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_return_imports" ADD CONSTRAINT "direct_debit_return_imports_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
