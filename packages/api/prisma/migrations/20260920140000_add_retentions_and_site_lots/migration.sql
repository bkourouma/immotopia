-- CreateEnum
CREATE TYPE "RetentionSourceType" AS ENUM ('SUPPLIER_INVOICE', 'PROGRESS_STATEMENT');

-- CreateEnum
CREATE TYPE "RetentionStatus" AS ENUM ('HELD', 'RELEASED');

-- CreateEnum
CREATE TYPE "SiteLotAllocationMethod" AS ENUM ('SURFACE', 'EQUAL', 'MANUAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SourceType" ADD VALUE 'RETENTION_HELD';
ALTER TYPE "SourceType" ADD VALUE 'RETENTION_RELEASED';

-- AlterTable
ALTER TABLE "construction_sites" ADD COLUMN     "closed_by_user_id" TEXT,
ADD COLUMN     "lot_allocation_method" "SiteLotAllocationMethod";

-- CreateTable
CREATE TABLE "retention_guarantees" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_type" "RetentionSourceType" NOT NULL,
    "source_id" UUID NOT NULL,
    "third_party_account_id" UUID NOT NULL,
    "site_id" UUID,
    "base_amount" DECIMAL(14,2) NOT NULL,
    "rate_percent" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "planned_release_date" TIMESTAMP(3) NOT NULL,
    "status" "RetentionStatus" NOT NULL DEFAULT 'HELD',
    "held_journal_entry_id" UUID,
    "released_journal_entry_id" UUID,
    "released_at" TIMESTAMP(3),
    "released_by_user_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_guarantees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_lots" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "site_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "surface_area" DECIMAL(12,2),
    "manual_share_percent" DECIMAL(5,2),
    "property_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retention_guarantees_tenant_id_idx" ON "retention_guarantees"("tenant_id");

-- CreateIndex
CREATE INDEX "retention_guarantees_tenant_id_status_idx" ON "retention_guarantees"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "retention_guarantees_site_id_idx" ON "retention_guarantees"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "retention_guarantees_source_type_source_id_key" ON "retention_guarantees"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_lots_property_id_key" ON "site_lots"("property_id");

-- CreateIndex
CREATE INDEX "site_lots_tenant_id_idx" ON "site_lots"("tenant_id");

-- CreateIndex
CREATE INDEX "site_lots_site_id_idx" ON "site_lots"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_lots_site_id_name_key" ON "site_lots"("site_id", "name");

-- AddForeignKey
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_guarantees" ADD CONSTRAINT "retention_guarantees_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_guarantees" ADD CONSTRAINT "retention_guarantees_third_party_account_id_fkey" FOREIGN KEY ("third_party_account_id") REFERENCES "third_party_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_guarantees" ADD CONSTRAINT "retention_guarantees_held_journal_entry_id_fkey" FOREIGN KEY ("held_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_guarantees" ADD CONSTRAINT "retention_guarantees_released_journal_entry_id_fkey" FOREIGN KEY ("released_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_guarantees" ADD CONSTRAINT "retention_guarantees_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_guarantees" ADD CONSTRAINT "retention_guarantees_released_by_user_id_fkey" FOREIGN KEY ("released_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_lots" ADD CONSTRAINT "site_lots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_lots" ADD CONSTRAINT "site_lots_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_lots" ADD CONSTRAINT "site_lots_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

