-- Lot 3 : compte courant des proprietaires et reversements. Additive uniquement.

-- CreateEnum
CREATE TYPE "OwnerPayoutStatus" AS ENUM ('VALIDATED', 'VOIDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SourceType" ADD VALUE 'OWNER_RENT_COLLECTED';
ALTER TYPE "SourceType" ADD VALUE 'OWNER_MANAGEMENT_FEE';
ALTER TYPE "SourceType" ADD VALUE 'OWNER_EXPENSE';
ALTER TYPE "SourceType" ADD VALUE 'OWNER_PAYOUT';

-- AlterEnum
ALTER TYPE "ThirdPartyKind" ADD VALUE 'OWNER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ThirdPartyMovementType" ADD VALUE 'RENT_COLLECTED';
ALTER TYPE "ThirdPartyMovementType" ADD VALUE 'MANAGEMENT_FEE';
ALTER TYPE "ThirdPartyMovementType" ADD VALUE 'MANAGEMENT_FEE_VAT';
ALTER TYPE "ThirdPartyMovementType" ADD VALUE 'EXPENSE';
ALTER TYPE "ThirdPartyMovementType" ADD VALUE 'PAYOUT';

-- CreateTable
CREATE TABLE "owner_payouts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_client_id" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "statement_id" UUID,
    "status" "OwnerPayoutStatus" NOT NULL DEFAULT 'VALIDATED',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_user_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "owner_payouts_tenant_id_owner_client_id_idx" ON "owner_payouts"("tenant_id", "owner_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "owner_payouts_tenant_id_year_sequence_key" ON "owner_payouts"("tenant_id", "year", "sequence");

-- AddForeignKey
ALTER TABLE "owner_payouts" ADD CONSTRAINT "owner_payouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_payouts" ADD CONSTRAINT "owner_payouts_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "tenant_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

