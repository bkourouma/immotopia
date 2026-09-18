-- CreateEnum
CREATE TYPE "ThirdPartyKind" AS ENUM ('TENANT', 'SUPPLIER', 'LANDLORD', 'CONTRACTOR', 'PARTNER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "ThirdPartyMovementType" AS ENUM ('INSTALLMENT', 'PAYMENT', 'ADVANCE_RECEIVED', 'ADVANCE_APPLIED', 'PENALTY', 'WAIVER', 'ADJUSTMENT', 'OPENING_BALANCE', 'VOID');

-- CreateEnum
CREATE TYPE "RentBillingRunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "third_party_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" "ThirdPartyKind" NOT NULL,
    "tenant_client_id" TEXT,
    "label" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "third_party_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "third_party_movements" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "movement_date" TIMESTAMP(3) NOT NULL,
    "type" "ThirdPartyMovementType" NOT NULL,
    "debit" DECIMAL(14,2),
    "credit" DECIMAL(14,2),
    "balance_after" DECIMAL(14,2) NOT NULL,
    "label" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "lease_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "third_party_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_billing_runs" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "RentBillingRunStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "summary" JSONB,

    CONSTRAINT "rent_billing_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "third_party_accounts_tenant_id_idx" ON "third_party_accounts"("tenant_id");

-- CreateIndex
CREATE INDEX "third_party_accounts_tenant_id_kind_idx" ON "third_party_accounts"("tenant_id", "kind");

-- CreateIndex
CREATE INDEX "third_party_accounts_tenant_client_id_idx" ON "third_party_accounts"("tenant_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "third_party_accounts_tenant_id_kind_tenant_client_id_key" ON "third_party_accounts"("tenant_id", "kind", "tenant_client_id");

-- CreateIndex
CREATE INDEX "third_party_movements_account_id_movement_date_created_at_idx" ON "third_party_movements"("account_id", "movement_date", "created_at");

-- CreateIndex
CREATE INDEX "third_party_movements_tenant_id_movement_date_idx" ON "third_party_movements"("tenant_id", "movement_date");

-- CreateIndex
CREATE INDEX "third_party_movements_lease_id_idx" ON "third_party_movements"("lease_id");

-- CreateIndex
CREATE UNIQUE INDEX "third_party_movements_source_type_source_id_type_key" ON "third_party_movements"("source_type", "source_id", "type");

-- CreateIndex
CREATE INDEX "rent_billing_runs_tenant_id_status_idx" ON "rent_billing_runs"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rent_billing_runs_tenant_id_period_year_period_month_key" ON "rent_billing_runs"("tenant_id", "period_year", "period_month");

-- AddForeignKey
ALTER TABLE "third_party_accounts" ADD CONSTRAINT "third_party_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "third_party_accounts" ADD CONSTRAINT "third_party_accounts_tenant_client_id_fkey" FOREIGN KEY ("tenant_client_id") REFERENCES "tenant_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "third_party_movements" ADD CONSTRAINT "third_party_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "third_party_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "third_party_movements" ADD CONSTRAINT "third_party_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "third_party_movements" ADD CONSTRAINT "third_party_movements_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_billing_runs" ADD CONSTRAINT "rent_billing_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_billing_runs" ADD CONSTRAINT "rent_billing_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
