-- AlterEnum
ALTER TYPE "CostAllocationSourceType" ADD VALUE 'PROGRESS_STATEMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SourceType" ADD VALUE 'PROGRESS_STATEMENT';
ALTER TYPE "SourceType" ADD VALUE 'CONTRACTOR_PAYMENT';

-- CreateTable
CREATE TABLE "contractors" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "trade" TEXT,
    "third_party_account_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_contracts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contractor_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "cost_category_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "agreed_amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "signed_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_statements" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contract_id" UUID NOT NULL,
    "statement_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "description" TEXT NOT NULL,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "journal_entry_id" UUID,
    "created_by_user_id" TEXT NOT NULL,
    "validated_by_user_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_payments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contractor_id" UUID NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "journal_entry_id" UUID,
    "created_by_user_id" TEXT NOT NULL,
    "validated_by_user_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contractors_tenant_id_idx" ON "contractors"("tenant_id");

-- CreateIndex
CREATE INDEX "contractors_tenant_id_is_active_idx" ON "contractors"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "contractor_contracts_tenant_id_idx" ON "contractor_contracts"("tenant_id");

-- CreateIndex
CREATE INDEX "contractor_contracts_contractor_id_idx" ON "contractor_contracts"("contractor_id");

-- CreateIndex
CREATE INDEX "contractor_contracts_site_id_idx" ON "contractor_contracts"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_contracts_tenant_id_reference_key" ON "contractor_contracts"("tenant_id", "reference");

-- CreateIndex
CREATE INDEX "progress_statements_tenant_id_idx" ON "progress_statements"("tenant_id");

-- CreateIndex
CREATE INDEX "progress_statements_contract_id_idx" ON "progress_statements"("contract_id");

-- CreateIndex
CREATE INDEX "contractor_payments_tenant_id_idx" ON "contractor_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "contractor_payments_contractor_id_idx" ON "contractor_payments"("contractor_id");

-- AddForeignKey
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_third_party_account_id_fkey" FOREIGN KEY ("third_party_account_id") REFERENCES "third_party_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_contracts" ADD CONSTRAINT "contractor_contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_contracts" ADD CONSTRAINT "contractor_contracts_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_contracts" ADD CONSTRAINT "contractor_contracts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_contracts" ADD CONSTRAINT "contractor_contracts_cost_category_id_fkey" FOREIGN KEY ("cost_category_id") REFERENCES "cost_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_statements" ADD CONSTRAINT "progress_statements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_statements" ADD CONSTRAINT "progress_statements_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contractor_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_statements" ADD CONSTRAINT "progress_statements_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_statements" ADD CONSTRAINT "progress_statements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_statements" ADD CONSTRAINT "progress_statements_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_payments" ADD CONSTRAINT "contractor_payments_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

