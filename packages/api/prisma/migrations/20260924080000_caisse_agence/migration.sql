-- Lot 6 : sessions de caisse de l agence. Additive uniquement.

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'VALIDATED');

-- AlterEnum
ALTER TYPE "SourceType" ADD VALUE 'CASH_SESSION_DIFFERENCE';

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "cashier_user_id" TEXT NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_float" DECIMAL(14,2) NOT NULL,
    "opening_note" TEXT,
    "closed_at" TIMESTAMP(3),
    "expected_breakdown" JSONB,
    "expected_amount" DECIMAL(14,2),
    "counted_amount" DECIMAL(14,2),
    "denominations" JSONB,
    "difference" DECIMAL(14,2),
    "difference_reason" TEXT,
    "validated_at" TIMESTAMP(3),
    "validated_by_user_id" TEXT,
    "validation_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_sessions_tenant_id_cashier_user_id_status_idx" ON "cash_sessions"("tenant_id", "cashier_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_tenant_id_year_sequence_key" ON "cash_sessions"("tenant_id", "year", "sequence");

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

