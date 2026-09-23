-- Lot 10 : conformite SYSCOHADA (tresorerie, auxiliaire des mandants, retenue a la source). Additive uniquement.

-- CreateEnum
CREATE TYPE "MandantFundsNature" AS ENUM ('CURRENT', 'DEPOSIT', 'UNALLOCATED');

-- CreateEnum
CREATE TYPE "PenaltyBeneficiary" AS ENUM ('OWNER', 'AGENCY');

-- CreateEnum
CREATE TYPE "OwnerTaxStatus" AS ENUM ('INDIVIDUAL', 'COMPANY', 'EXEMPT');

-- CreateEnum
CREATE TYPE "TreasuryAccountKind" AS ENUM ('CASH', 'BANK', 'MOBILE_MONEY', 'CHECKS_TO_CASH', 'CARDS_TO_CASH');

-- CreateEnum
CREATE TYPE "TreasuryDocumentStatus" AS ENUM ('VALIDATED', 'VOIDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SourceType" ADD VALUE 'OWNER_UNALLOCATED';
ALTER TYPE "SourceType" ADD VALUE 'OWNER_AUX_REALLOC';
ALTER TYPE "SourceType" ADD VALUE 'OWNER_WITHHOLDING';
ALTER TYPE "SourceType" ADD VALUE 'OWNER_DEPOSIT';
ALTER TYPE "SourceType" ADD VALUE 'TREASURY_TRANSFER';
ALTER TYPE "SourceType" ADD VALUE 'TAX_REMITTANCE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ThirdPartyMovementType" ADD VALUE 'WITHHOLDING_TAX';
ALTER TYPE "ThirdPartyMovementType" ADD VALUE 'DEPOSIT_RETAINED';

-- AlterTable
ALTER TABLE "agency_finance_settings" ADD COLUMN     "cash_shortage_account_number" TEXT,
ADD COLUMN     "cash_surplus_account_number" TEXT,
ADD COLUMN     "penalty_beneficiary" "PenaltyBeneficiary" NOT NULL DEFAULT 'OWNER',
ADD COLUMN     "penalty_income_account_number" TEXT,
ADD COLUMN     "withholding_account_number" TEXT,
ADD COLUMN     "withholding_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "withholding_rate_company" DECIMAL(5,2) NOT NULL DEFAULT 15,
ADD COLUMN     "withholding_rate_individual" DECIMAL(5,2) NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "cash_sessions" ADD COLUMN     "treasury_account_id" UUID;

-- AlterTable
ALTER TABLE "journal_entry_lines" ADD COLUMN     "funds_nature" "MandantFundsNature",
ADD COLUMN     "third_party_account_id" UUID;

-- AlterTable
ALTER TABLE "owner_payouts" ADD COLUMN     "treasury_account_id" UUID;

-- AlterTable
ALTER TABLE "property_expenses" ADD COLUMN     "agency_is_buyer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payment_method" "PaymentMethod",
ADD COLUMN     "supplier_name" TEXT,
ADD COLUMN     "treasury_account_id" UUID;

-- AlterTable
ALTER TABLE "rental_deposit_movements" ADD COLUMN     "treasury_account_id" UUID;

-- AlterTable
ALTER TABLE "rental_payments" ADD COLUMN     "treasury_account_id" UUID;

-- AlterTable
ALTER TABLE "tenant_clients" ADD COLUMN     "owner_tax_status" "OwnerTaxStatus";

-- CreateTable
CREATE TABLE "treasury_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" "TreasuryAccountKind" NOT NULL,
    "label" TEXT NOT NULL,
    "chart_of_account_id" UUID NOT NULL,
    "account_number" TEXT NOT NULL,
    "mm_operator" "MobileMoneyOperator",
    "bank_name" TEXT,
    "bank_account_ref" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treasury_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_transfers" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "from_treasury_account_id" UUID NOT NULL,
    "to_treasury_account_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "transferred_at" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "status" "TreasuryDocumentStatus" NOT NULL DEFAULT 'VALIDATED',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_user_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treasury_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_withholdings" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "allocation_id" UUID NOT NULL,
    "owner_client_id" TEXT NOT NULL,
    "lease_id" UUID NOT NULL,
    "property_id" TEXT NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "tax_status" "OwnerTaxStatus" NOT NULL,
    "base_amount" DECIMAL(14,2) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rent_withholdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_remittances" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "period_label" TEXT NOT NULL,
    "treasury_account_id" UUID NOT NULL,
    "reference" TEXT,
    "status" "TreasuryDocumentStatus" NOT NULL DEFAULT 'VALIDATED',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_user_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_remittances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "treasury_accounts_chart_of_account_id_key" ON "treasury_accounts"("chart_of_account_id");

-- CreateIndex
CREATE INDEX "treasury_accounts_tenant_id_kind_idx" ON "treasury_accounts"("tenant_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_accounts_tenant_id_account_number_key" ON "treasury_accounts"("tenant_id", "account_number");

-- CreateIndex
CREATE INDEX "treasury_transfers_tenant_id_transferred_at_idx" ON "treasury_transfers"("tenant_id", "transferred_at");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_transfers_tenant_id_year_sequence_key" ON "treasury_transfers"("tenant_id", "year", "sequence");

-- CreateIndex
CREATE INDEX "rent_withholdings_tenant_id_owner_client_id_collected_at_idx" ON "rent_withholdings"("tenant_id", "owner_client_id", "collected_at");

-- CreateIndex
CREATE UNIQUE INDEX "rent_withholdings_allocation_id_owner_client_id_key" ON "rent_withholdings"("allocation_id", "owner_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_remittances_tenant_id_year_sequence_key" ON "tax_remittances"("tenant_id", "year", "sequence");

-- CreateIndex
CREATE INDEX "journal_entry_lines_third_party_account_id_idx" ON "journal_entry_lines"("third_party_account_id");

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_third_party_account_id_fkey" FOREIGN KEY ("third_party_account_id") REFERENCES "third_party_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_accounts" ADD CONSTRAINT "treasury_accounts_chart_of_account_id_fkey" FOREIGN KEY ("chart_of_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_transfers" ADD CONSTRAINT "treasury_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_withholdings" ADD CONSTRAINT "rent_withholdings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_remittances" ADD CONSTRAINT "tax_remittances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
