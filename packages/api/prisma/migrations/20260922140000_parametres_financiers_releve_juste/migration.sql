-- Parametres financiers de l agence et releve proprietaire juste (lot 1).
--
-- Additive uniquement : les releves existants gardent leurs montants et
-- recoivent computation_version = 1, qui les signale comme calcules selon
-- l ancienne methode (loyer du contrat pris pour un loyer encaisse).

-- CreateEnum
CREATE TYPE "ManagementFeeBase" AS ENUM ('RENT_ONLY', 'ALL_COLLECTED');

-- AlterEnum
ALTER TYPE "StatementItemType" ADD VALUE 'MANAGEMENT_FEE_VAT';

-- AlterTable
ALTER TABLE "owner_statements" ADD COLUMN     "computation_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "management_fee_base" "ManagementFeeBase",
ADD COLUMN     "management_fee_rate" DECIMAL(5,2),
ADD COLUMN     "property_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "total_arrears" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total_management_fees" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total_management_fees_vat" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "total_rent_due" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "vat_rate" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "agency_finance_settings" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "vat_registered" BOOLEAN NOT NULL DEFAULT false,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "taxpayer_number" TEXT,
    "management_fee_rate" DECIMAL(5,2),
    "management_fee_base" "ManagementFeeBase" NOT NULL DEFAULT 'RENT_ONLY',
    "owner_funds_account_number" TEXT,
    "management_fee_account_number" TEXT,
    "vat_collected_account_number" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agency_finance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agency_finance_settings_tenant_id_key" ON "agency_finance_settings"("tenant_id");

-- AddForeignKey
ALTER TABLE "agency_finance_settings" ADD CONSTRAINT "agency_finance_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

