-- Prelevement bancaire, lot P1 (spec 042, data-model §1) : creanciers (compte
-- bancaire qui recoit les prelevements d'une agence) et mandats de prelevement
-- signes par les debiteurs. Additive : deux enumerations, deux tables, aucune
-- donnee existante modifiee. L'IBAN d'un mandat est stocke chiffre
-- (`iban_encrypted`, format pg1:...) ; `open_slot_key` porte l'unicite d'un
-- mandat ouvert par (bail, creancier) : nul une fois le mandat revoque.
-- Genere par `prisma migrate diff` contre le schema de origin/main.

-- CreateEnum
CREATE TYPE "DirectDebitFileFormat" AS ENUM ('GENERIC_CSV');

-- CreateEnum
CREATE TYPE "DirectDebitMandateScope" AS ENUM ('RENTAL_LEASE');

-- CreateEnum
CREATE TYPE "DirectDebitMandateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateTable
CREATE TABLE "direct_debit_creditors" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "treasury_account_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "creditor_identifier" TEXT,
    "file_format" "DirectDebitFileFormat" NOT NULL DEFAULT 'GENERIC_CSV',
    "collection_day" INTEGER NOT NULL DEFAULT 5,
    "prenotification_business_days" INTEGER NOT NULL DEFAULT 5,
    "reject_fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "max_consecutive_rejects" INTEGER NOT NULL DEFAULT 2,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_debit_creditors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_debit_mandates" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "scope" "DirectDebitMandateScope" NOT NULL DEFAULT 'RENTAL_LEASE',
    "creditor_id" UUID NOT NULL,
    "debtor_client_id" TEXT NOT NULL,
    "lease_id" UUID,
    "status" "DirectDebitMandateStatus" NOT NULL DEFAULT 'DRAFT',
    "iban_encrypted" TEXT NOT NULL,
    "iban_bank_code" TEXT NOT NULL,
    "iban_last4" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "max_amount" DECIMAL(12,2),
    "collection_day" INTEGER,
    "signed_at" TIMESTAMP(3),
    "signed_scan_url" TEXT,
    "signed_scan_uploaded_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),
    "suspension_reason" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" TEXT,
    "consecutive_rejects" INTEGER NOT NULL DEFAULT 0,
    "open_slot_key" TEXT,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "direct_debit_mandates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "direct_debit_creditors_tenant_id_idx" ON "direct_debit_creditors"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "direct_debit_creditors_tenant_id_treasury_account_id_key" ON "direct_debit_creditors"("tenant_id", "treasury_account_id");

-- CreateIndex
CREATE INDEX "direct_debit_mandates_tenant_id_status_idx" ON "direct_debit_mandates"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "direct_debit_mandates_lease_id_idx" ON "direct_debit_mandates"("lease_id");

-- CreateIndex
CREATE INDEX "direct_debit_mandates_debtor_client_id_idx" ON "direct_debit_mandates"("debtor_client_id");

-- CreateIndex
CREATE INDEX "direct_debit_mandates_creditor_id_idx" ON "direct_debit_mandates"("creditor_id");

-- CreateIndex
CREATE UNIQUE INDEX "direct_debit_mandates_tenant_id_year_sequence_key" ON "direct_debit_mandates"("tenant_id", "year", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "direct_debit_mandates_tenant_id_open_slot_key_key" ON "direct_debit_mandates"("tenant_id", "open_slot_key");

-- AddForeignKey
ALTER TABLE "direct_debit_creditors" ADD CONSTRAINT "direct_debit_creditors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_creditors" ADD CONSTRAINT "direct_debit_creditors_treasury_account_id_fkey" FOREIGN KEY ("treasury_account_id") REFERENCES "treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_mandates" ADD CONSTRAINT "direct_debit_mandates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_mandates" ADD CONSTRAINT "direct_debit_mandates_creditor_id_fkey" FOREIGN KEY ("creditor_id") REFERENCES "direct_debit_creditors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_mandates" ADD CONSTRAINT "direct_debit_mandates_debtor_client_id_fkey" FOREIGN KEY ("debtor_client_id") REFERENCES "tenant_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_debit_mandates" ADD CONSTRAINT "direct_debit_mandates_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

