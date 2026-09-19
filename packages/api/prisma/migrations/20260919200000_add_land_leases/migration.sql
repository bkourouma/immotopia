-- CreateTable
CREATE TABLE "land_leases" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "landlord_account_id" UUID NOT NULL,
    "landlord_name" TEXT NOT NULL,
    "land_label" TEXT NOT NULL,
    "annual_amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "land_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "land_lease_payments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "land_lease_id" UUID NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "coverage_start_date" TIMESTAMP(3) NOT NULL,
    "coverage_end_date" TIMESTAMP(3) NOT NULL,
    "journal_entry_id" UUID,
    "created_by_user_id" TEXT NOT NULL,
    "validated_by_user_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "land_lease_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "land_lease_accruals" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "land_lease_id" UUID NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "journal_entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "land_lease_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "land_leases_tenant_id_idx" ON "land_leases"("tenant_id");

-- CreateIndex
CREATE INDEX "land_leases_tenant_id_is_active_idx" ON "land_leases"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "land_lease_payments_tenant_id_idx" ON "land_lease_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "land_lease_payments_land_lease_id_idx" ON "land_lease_payments"("land_lease_id");

-- CreateIndex
CREATE INDEX "land_lease_accruals_tenant_id_idx" ON "land_lease_accruals"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "land_lease_accruals_land_lease_id_period_year_period_month_key" ON "land_lease_accruals"("land_lease_id", "period_year", "period_month");

-- AddForeignKey
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_land_lease_id_fkey" FOREIGN KEY ("land_lease_id") REFERENCES "land_leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_leases" ADD CONSTRAINT "land_leases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_leases" ADD CONSTRAINT "land_leases_landlord_account_id_fkey" FOREIGN KEY ("landlord_account_id") REFERENCES "third_party_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_lease_payments" ADD CONSTRAINT "land_lease_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_lease_payments" ADD CONSTRAINT "land_lease_payments_land_lease_id_fkey" FOREIGN KEY ("land_lease_id") REFERENCES "land_leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_lease_payments" ADD CONSTRAINT "land_lease_payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_lease_payments" ADD CONSTRAINT "land_lease_payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_lease_payments" ADD CONSTRAINT "land_lease_payments_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_lease_accruals" ADD CONSTRAINT "land_lease_accruals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_lease_accruals" ADD CONSTRAINT "land_lease_accruals_land_lease_id_fkey" FOREIGN KEY ("land_lease_id") REFERENCES "land_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_lease_accruals" ADD CONSTRAINT "land_lease_accruals_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

