-- CreateEnum
CREATE TYPE "RentalLeaseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RentalBillingFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "RentalInstallmentStatus" AS ENUM ('DRAFT', 'DUE', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "RentalChargeType" AS ENUM ('RENT', 'SERVICE_CHARGE', 'UTILITY', 'MAINTENANCE', 'DOSSIER_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalPaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "MobileMoneyOperator" AS ENUM ('ORANGE', 'MTN', 'MOOV', 'WAVE', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalPenaltyMode" AS ENUM ('FIXED_AMOUNT', 'PERCENT_OF_RENT', 'PERCENT_OF_BALANCE');

-- CreateEnum
CREATE TYPE "RentalDepositMovementType" AS ENUM ('COLLECT', 'HOLD', 'RELEASE', 'REFUND', 'FORFEIT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RentalDocumentType" AS ENUM ('LEASE_CONTRACT', 'LEASE_ADDENDUM', 'RENT_RECEIPT', 'RENT_QUITTANCE', 'DEPOSIT_RECEIPT', 'STATEMENT', 'OTHER');

-- CreateEnum: Only if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RentalDocumentStatus') THEN
        CREATE TYPE "RentalDocumentStatus" AS ENUM ('DRAFT', 'FINAL', 'VOID');
    END IF;
END $$;

-- CreateTable
CREATE TABLE "rental_leases" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "primary_renter_client_id" TEXT NOT NULL,
    "owner_client_id" TEXT,
    "crm_deal_id" TEXT,
    "lease_number" TEXT NOT NULL,
    "status" "RentalLeaseStatus" NOT NULL DEFAULT 'DRAFT',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "move_in_date" TIMESTAMP(3),
    "move_out_date" TIMESTAMP(3),
    "billing_frequency" "RentalBillingFrequency" NOT NULL DEFAULT 'MONTHLY',
    "due_day_of_month" INTEGER NOT NULL DEFAULT 5,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "rent_amount" DECIMAL(12,2) NOT NULL,
    "service_charge_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "security_deposit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penalty_grace_days" INTEGER NOT NULL DEFAULT 0,
    "penalty_mode" "RentalPenaltyMode" NOT NULL DEFAULT 'PERCENT_OF_BALANCE',
    "penalty_rate" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "penalty_fixed_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penalty_cap_amount" DECIMAL(12,2),
    "notes" TEXT,
    "terms_json" JSONB,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_lease_co_renters" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" UUID NOT NULL,
    "renter_client_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_lease_co_renters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_installments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" UUID NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "RentalInstallmentStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "amount_rent" DECIMAL(12,2) NOT NULL,
    "amount_service" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount_other_fees" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penalty_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paid_at" TIMESTAMP(3),
    "invoice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_installment_items" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "installment_id" UUID NOT NULL,
    "charge_type" "RentalChargeType" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_installment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_payments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" UUID,
    "renter_client_id" TEXT,
    "invoice_id" TEXT,
    "method" "RentalPaymentMethod" NOT NULL,
    "status" "RentalPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "amount" DECIMAL(12,2) NOT NULL,
    "mm_operator" "MobileMoneyOperator",
    "mm_phone" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "psp_name" TEXT,
    "psp_transaction_id" TEXT,
    "psp_reference" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeeded_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "raw_event_payload" JSONB,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_payment_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payment_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_refunds" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payment_id" UUID NOT NULL,
    "status" "RentalPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "amount" DECIMAL(12,2) NOT NULL,
    "psp_refund_id" TEXT,
    "raw_event_payload" JSONB,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_penalty_rules" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "grace_days" INTEGER NOT NULL DEFAULT 0,
    "mode" "RentalPenaltyMode" NOT NULL DEFAULT 'PERCENT_OF_BALANCE',
    "fixed_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rate" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "cap_amount" DECIMAL(12,2),
    "min_balance_to_apply" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_penalty_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_penalties" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "installment_id" UUID NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "days_late" INTEGER NOT NULL,
    "mode" "RentalPenaltyMode" NOT NULL,
    "rate" DECIMAL(12,4),
    "fixed_amount" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "override_reason" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_penalties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_security_deposits" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "target_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "collected_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "held_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refunded_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "forfeited_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_security_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_deposit_movements" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deposit_id" UUID NOT NULL,
    "type" "RentalDepositMovementType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_id" UUID,
    "installment_id" UUID,
    "note" TEXT,
    "metadata" JSONB,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_deposit_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_documents" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "RentalDocumentType" NOT NULL,
    "status" "RentalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "lease_id" UUID,
    "installment_id" UUID,
    "payment_id" UUID,
    "document_number" TEXT,
    "file_url" TEXT,
    "file_key" TEXT,
    "mime_type" TEXT,
    "content_hash" TEXT,
    "issued_at" TIMESTAMP(3),
    "title" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rental_leases_tenant_id_idx" ON "rental_leases"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_leases_tenant_id_status_idx" ON "rental_leases"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "rental_leases_tenant_id_property_id_idx" ON "rental_leases"("tenant_id", "property_id");

-- CreateIndex
CREATE INDEX "rental_leases_tenant_id_primary_renter_client_id_idx" ON "rental_leases"("tenant_id", "primary_renter_client_id");

-- CreateIndex
CREATE INDEX "rental_leases_crm_deal_id_idx" ON "rental_leases"("crm_deal_id");

-- CreateIndex
CREATE INDEX "rental_leases_start_date_idx" ON "rental_leases"("start_date");

-- CreateIndex
CREATE INDEX "rental_leases_end_date_idx" ON "rental_leases"("end_date");

-- CreateIndex
CREATE UNIQUE INDEX "rental_leases_tenant_id_lease_number_key" ON "rental_leases"("tenant_id", "lease_number");

-- CreateIndex
CREATE INDEX "rental_lease_co_renters_tenant_id_idx" ON "rental_lease_co_renters"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_lease_co_renters_lease_id_idx" ON "rental_lease_co_renters"("lease_id");

-- CreateIndex
CREATE INDEX "rental_lease_co_renters_renter_client_id_idx" ON "rental_lease_co_renters"("renter_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_lease_co_renters_lease_id_renter_client_id_key" ON "rental_lease_co_renters"("lease_id", "renter_client_id");

-- CreateIndex
CREATE INDEX "rental_installments_tenant_id_idx" ON "rental_installments"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_installments_tenant_id_status_idx" ON "rental_installments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "rental_installments_tenant_id_due_date_idx" ON "rental_installments"("tenant_id", "due_date");

-- CreateIndex
CREATE INDEX "rental_installments_lease_id_idx" ON "rental_installments"("lease_id");

-- CreateIndex
CREATE INDEX "rental_installments_invoice_id_idx" ON "rental_installments"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_installments_lease_id_period_year_period_month_key" ON "rental_installments"("lease_id", "period_year", "period_month");

-- CreateIndex
CREATE INDEX "rental_installment_items_tenant_id_idx" ON "rental_installment_items"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_installment_items_installment_id_idx" ON "rental_installment_items"("installment_id");

-- CreateIndex
CREATE INDEX "rental_installment_items_charge_type_idx" ON "rental_installment_items"("charge_type");

-- CreateIndex
CREATE INDEX "rental_payments_tenant_id_idx" ON "rental_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_payments_tenant_id_status_idx" ON "rental_payments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "rental_payments_tenant_id_method_idx" ON "rental_payments"("tenant_id", "method");

-- CreateIndex
CREATE INDEX "rental_payments_lease_id_idx" ON "rental_payments"("lease_id");

-- CreateIndex
CREATE INDEX "rental_payments_invoice_id_idx" ON "rental_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "rental_payments_renter_client_id_idx" ON "rental_payments"("renter_client_id");

-- CreateIndex
CREATE INDEX "rental_payments_initiated_at_idx" ON "rental_payments"("initiated_at");

-- CreateIndex
CREATE UNIQUE INDEX "rental_payments_idempotency_key_key" ON "rental_payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "rental_payments_psp_transaction_id_key" ON "rental_payments"("psp_transaction_id");

-- CreateIndex
CREATE INDEX "rental_payment_allocations_tenant_id_idx" ON "rental_payment_allocations"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_payment_allocations_payment_id_idx" ON "rental_payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "rental_payment_allocations_installment_id_idx" ON "rental_payment_allocations"("installment_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_payment_allocations_payment_id_installment_id_key" ON "rental_payment_allocations"("payment_id", "installment_id");

-- CreateIndex
CREATE INDEX "rental_refunds_tenant_id_idx" ON "rental_refunds"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_refunds_payment_id_idx" ON "rental_refunds"("payment_id");

-- CreateIndex
CREATE INDEX "rental_refunds_tenant_id_status_idx" ON "rental_refunds"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rental_refunds_psp_refund_id_key" ON "rental_refunds"("psp_refund_id");

-- CreateIndex
CREATE INDEX "rental_penalty_rules_tenant_id_idx" ON "rental_penalty_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_penalty_rules_tenant_id_is_active_idx" ON "rental_penalty_rules"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "rental_penalties_tenant_id_idx" ON "rental_penalties"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_penalties_installment_id_idx" ON "rental_penalties"("installment_id");

-- CreateIndex
CREATE INDEX "rental_penalties_calculated_at_idx" ON "rental_penalties"("calculated_at");

-- CreateIndex
CREATE INDEX "rental_security_deposits_tenant_id_idx" ON "rental_security_deposits"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_security_deposits_lease_id_key" ON "rental_security_deposits"("lease_id");

-- CreateIndex
CREATE INDEX "rental_deposit_movements_tenant_id_idx" ON "rental_deposit_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_deposit_movements_deposit_id_idx" ON "rental_deposit_movements"("deposit_id");

-- CreateIndex
CREATE INDEX "rental_deposit_movements_payment_id_idx" ON "rental_deposit_movements"("payment_id");

-- CreateIndex
CREATE INDEX "rental_deposit_movements_installment_id_idx" ON "rental_deposit_movements"("installment_id");

-- CreateIndex
CREATE INDEX "rental_deposit_movements_created_at_idx" ON "rental_deposit_movements"("created_at");

-- CreateIndex
CREATE INDEX "rental_documents_tenant_id_idx" ON "rental_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_documents_tenant_id_type_idx" ON "rental_documents"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "rental_documents_lease_id_idx" ON "rental_documents"("lease_id");

-- CreateIndex
CREATE INDEX "rental_documents_installment_id_idx" ON "rental_documents"("installment_id");

-- CreateIndex
CREATE INDEX "rental_documents_payment_id_idx" ON "rental_documents"("payment_id");

-- CreateIndex
CREATE INDEX "rental_documents_issued_at_idx" ON "rental_documents"("issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "rental_documents_document_number_key" ON "rental_documents"("document_number");

-- AddForeignKey
ALTER TABLE "rental_leases" ADD CONSTRAINT "rental_leases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_leases" ADD CONSTRAINT "rental_leases_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_leases" ADD CONSTRAINT "rental_leases_primary_renter_client_id_fkey" FOREIGN KEY ("primary_renter_client_id") REFERENCES "tenant_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_leases" ADD CONSTRAINT "rental_leases_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "tenant_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_leases" ADD CONSTRAINT "rental_leases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_lease_co_renters" ADD CONSTRAINT "rental_lease_co_renters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_lease_co_renters" ADD CONSTRAINT "rental_lease_co_renters_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_lease_co_renters" ADD CONSTRAINT "rental_lease_co_renters_renter_client_id_fkey" FOREIGN KEY ("renter_client_id") REFERENCES "tenant_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_installments" ADD CONSTRAINT "rental_installments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_installments" ADD CONSTRAINT "rental_installments_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_installments" ADD CONSTRAINT "rental_installments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_installment_items" ADD CONSTRAINT "rental_installment_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_installment_items" ADD CONSTRAINT "rental_installment_items_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_renter_client_id_fkey" FOREIGN KEY ("renter_client_id") REFERENCES "tenant_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payment_allocations" ADD CONSTRAINT "rental_payment_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payment_allocations" ADD CONSTRAINT "rental_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "rental_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payment_allocations" ADD CONSTRAINT "rental_payment_allocations_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_refunds" ADD CONSTRAINT "rental_refunds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_refunds" ADD CONSTRAINT "rental_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "rental_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_refunds" ADD CONSTRAINT "rental_refunds_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_penalty_rules" ADD CONSTRAINT "rental_penalty_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_penalties" ADD CONSTRAINT "rental_penalties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_penalties" ADD CONSTRAINT "rental_penalties_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_penalties" ADD CONSTRAINT "rental_penalties_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_security_deposits" ADD CONSTRAINT "rental_security_deposits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_security_deposits" ADD CONSTRAINT "rental_security_deposits_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposit_movements" ADD CONSTRAINT "rental_deposit_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposit_movements" ADD CONSTRAINT "rental_deposit_movements_deposit_id_fkey" FOREIGN KEY ("deposit_id") REFERENCES "rental_security_deposits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposit_movements" ADD CONSTRAINT "rental_deposit_movements_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "rental_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposit_movements" ADD CONSTRAINT "rental_deposit_movements_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposit_movements" ADD CONSTRAINT "rental_deposit_movements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "rental_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

