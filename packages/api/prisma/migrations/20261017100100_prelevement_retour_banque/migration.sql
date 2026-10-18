-- Spec 042 P3 : retour banque (constat de règlement/rejet, import de fichier).

-- CreateEnum
CREATE TYPE "DirectDebitReturnSource" AS ENUM ('MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "DirectDebitReturnFormat" AS ENUM ('GENERIC_CSV');

-- CreateEnum
CREATE TYPE "DirectDebitRecipientSource" AS ENUM ('ACCOUNT', 'CONTACT');

-- AlterTable
ALTER TABLE "direct_debit_remittance_lines" ADD COLUMN     "prenotification_recipient_masked" TEXT,
ADD COLUMN     "prenotification_recipient_source" "DirectDebitRecipientSource",
ADD COLUMN     "reject_fee_amount" DECIMAL(12,2),
ADD COLUMN     "rejected_at" DATE,
ADD COLUMN     "rejection_code" TEXT,
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "rental_payment_id" UUID,
ADD COLUMN     "return_import_id" UUID,
ADD COLUMN     "return_recorded_at" TIMESTAMP(3),
ADD COLUMN     "return_recorded_by_user_id" TEXT,
ADD COLUMN     "return_source" "DirectDebitReturnSource",
ADD COLUMN     "settled_at" DATE;

-- CreateTable
CREATE TABLE "direct_debit_return_imports" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "scope" "DirectDebitMandateScope" NOT NULL DEFAULT 'RENTAL_LEASE',
    "format" "DirectDebitReturnFormat" NOT NULL DEFAULT 'GENERIC_CSV',
    "file_name" TEXT NOT NULL,
    "file_digest" TEXT NOT NULL,
    "record_count" INTEGER NOT NULL,
    "settled_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "imported_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_debit_return_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "direct_debit_return_imports_tenant_id_created_at_idx" ON "direct_debit_return_imports"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "direct_debit_return_imports_tenant_id_file_digest_idx" ON "direct_debit_return_imports"("tenant_id", "file_digest");

-- CreateIndex
CREATE UNIQUE INDEX "direct_debit_remittance_lines_rental_payment_id_key" ON "direct_debit_remittance_lines"("rental_payment_id");

-- CreateIndex
CREATE INDEX "direct_debit_remittance_lines_return_import_id_idx" ON "direct_debit_remittance_lines"("return_import_id");

-- AddForeignKey
ALTER TABLE "direct_debit_remittance_lines" ADD CONSTRAINT "direct_debit_remittance_lines_rental_payment_id_fkey" FOREIGN KEY ("rental_payment_id") REFERENCES "rental_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_remittance_lines" ADD CONSTRAINT "direct_debit_remittance_lines_return_import_id_fkey" FOREIGN KEY ("return_import_id") REFERENCES "direct_debit_return_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_return_imports" ADD CONSTRAINT "direct_debit_return_imports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
