-- Lot 2 : honoraires de gestion (forfait, conditions par proprietaire et par bail,
-- part des collaborateurs, honoraires figes a l encaissement). Additive uniquement.

-- CreateEnum
CREATE TYPE "ManagementFeeMode" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "ManagementFeeSource" AS ENUM ('LEASE', 'OWNER', 'AGENCY');

-- AlterTable
ALTER TABLE "agency_finance_settings" ADD COLUMN     "management_fee_fixed_amount" DECIMAL(14,2),
ADD COLUMN     "management_fee_mode" "ManagementFeeMode" NOT NULL DEFAULT 'PERCENT';

-- CreateTable
CREATE TABLE "owner_management_terms" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_client_id" TEXT NOT NULL,
    "management_fee_mode" "ManagementFeeMode" NOT NULL DEFAULT 'PERCENT',
    "management_fee_rate" DECIMAL(5,2),
    "management_fee_fixed_amount" DECIMAL(14,2),
    "management_fee_base" "ManagementFeeBase" NOT NULL DEFAULT 'RENT_ONLY',
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_management_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_management_terms" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" UUID NOT NULL,
    "management_fee_mode" "ManagementFeeMode",
    "management_fee_rate" DECIMAL(5,2),
    "management_fee_fixed_amount" DECIMAL(14,2),
    "management_fee_base" "ManagementFeeBase",
    "agent_user_id" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_management_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_commission_rates" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "share_percent" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_commission_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "management_fees" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "allocation_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "property_id" TEXT NOT NULL,
    "owner_client_id" TEXT,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "collected_amount" DECIMAL(14,2) NOT NULL,
    "base_amount" DECIMAL(14,2) NOT NULL,
    "source" "ManagementFeeSource" NOT NULL,
    "mode" "ManagementFeeMode" NOT NULL,
    "rate" DECIMAL(5,2),
    "fixed_amount" DECIMAL(14,2),
    "fee_base" "ManagementFeeBase",
    "fee_amount" DECIMAL(14,2) NOT NULL,
    "vat_rate" DECIMAL(5,2),
    "vat_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "agent_user_id" TEXT,
    "agent_share_percent" DECIMAL(5,2),
    "agent_share_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "management_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_management_terms_owner_client_id_key" ON "owner_management_terms"("owner_client_id");

-- CreateIndex
CREATE INDEX "owner_management_terms_tenant_id_idx" ON "owner_management_terms"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "lease_management_terms_lease_id_key" ON "lease_management_terms"("lease_id");

-- CreateIndex
CREATE INDEX "lease_management_terms_tenant_id_idx" ON "lease_management_terms"("tenant_id");

-- CreateIndex
CREATE INDEX "lease_management_terms_agent_user_id_idx" ON "lease_management_terms"("agent_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_commission_rates_tenant_id_user_id_key" ON "agent_commission_rates"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "management_fees_allocation_id_key" ON "management_fees"("allocation_id");

-- CreateIndex
CREATE INDEX "management_fees_tenant_id_collected_at_idx" ON "management_fees"("tenant_id", "collected_at");

-- CreateIndex
CREATE INDEX "management_fees_tenant_id_property_id_collected_at_idx" ON "management_fees"("tenant_id", "property_id", "collected_at");

-- CreateIndex
CREATE INDEX "management_fees_agent_user_id_idx" ON "management_fees"("agent_user_id");

-- AddForeignKey
ALTER TABLE "owner_management_terms" ADD CONSTRAINT "owner_management_terms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_management_terms" ADD CONSTRAINT "owner_management_terms_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "tenant_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_management_terms" ADD CONSTRAINT "lease_management_terms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_management_terms" ADD CONSTRAINT "lease_management_terms_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_management_terms" ADD CONSTRAINT "lease_management_terms_agent_user_id_fkey" FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commission_rates" ADD CONSTRAINT "agent_commission_rates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_commission_rates" ADD CONSTRAINT "agent_commission_rates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_fees" ADD CONSTRAINT "management_fees_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_fees" ADD CONSTRAINT "management_fees_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "rental_payment_allocations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

