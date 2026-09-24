-- CreateEnum
CREATE TYPE "SaleMandateType" AS ENUM ('SIMPLE', 'EXCLUSIVE');

-- CreateEnum
CREATE TYPE "SaleMandateStatus" AS ENUM ('ACTIVE', 'REVOKED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SaleCommissionMode" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "SaleCommissionPayer" AS ENUM ('SELLER', 'BUYER');

-- CreateEnum
CREATE TYPE "SaleFinancing" AS ENUM ('CASH', 'LOAN', 'MIXED');

-- CreateEnum
CREATE TYPE "SaleOfferStatus" AS ENUM ('SUBMITTED', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SaleDepositHolder" AS ENUM ('NOTARY', 'SELLER');

-- CreateEnum
CREATE TYPE "SaleAgreementStatus" AS ENUM ('DRAFT', 'SIGNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleConditionStatus" AS ENUM ('PENDING', 'MET', 'FAILED', 'WAIVED');

-- CreateEnum
CREATE TYPE "SaleCommissionStatus" AS ENUM ('DUE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleCommissionPaymentStatus" AS ENUM ('POSTED', 'VOIDED');

-- AlterEnum
ALTER TYPE "SourceType" ADD VALUE 'SALE_COMMISSION_PAYMENT';

-- CreateTable
CREATE TABLE "sale_mandates" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "property_id" TEXT NOT NULL,
    "seller_client_id" TEXT NOT NULL,
    "mandate_type" "SaleMandateType" NOT NULL,
    "asking_price" DECIMAL(14,2) NOT NULL,
    "minimum_price" DECIMAL(14,2),
    "commission_mode" "SaleCommissionMode" NOT NULL,
    "commission_rate" DECIMAL(7,4),
    "commission_fixed_amount" DECIMAL(14,2),
    "commission_payer" "SaleCommissionPayer" NOT NULL,
    "agent_user_id" TEXT,
    "agent_share_percent" DECIMAL(7,4),
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "SaleMandateStatus" NOT NULL DEFAULT 'ACTIVE',
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" TEXT,
    "revoke_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_mandates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_offers" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "mandate_id" UUID NOT NULL,
    "buyer_contact_id" TEXT NOT NULL,
    "deal_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "financing" "SaleFinancing" NOT NULL,
    "conditions" TEXT,
    "valid_until" DATE,
    "status" "SaleOfferStatus" NOT NULL DEFAULT 'SUBMITTED',
    "counter_amount" DECIMAL(14,2),
    "decided_at" TIMESTAMP(3),
    "decided_by_user_id" TEXT,
    "decision_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_agreements" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "offer_id" UUID NOT NULL,
    "mandate_id" UUID NOT NULL,
    "property_id" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "deposit_amount" DECIMAL(14,2),
    "deposit_holder" "SaleDepositHolder",
    "notary_name" TEXT,
    "signed_at" DATE,
    "expected_deed_date" DATE,
    "deed_date" DATE,
    "status" "SaleAgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "cancelled_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_agreement_conditions" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "agreement_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "due_date" DATE,
    "status" "SaleConditionStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_agreement_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payment_milestones" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "agreement_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "due_date" DATE,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_at" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_payment_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_commissions" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "agreement_id" UUID NOT NULL,
    "mandate_id" UUID NOT NULL,
    "payer" "SaleCommissionPayer" NOT NULL,
    "base_amount" DECIMAL(14,2) NOT NULL,
    "amount_excl_tax" DECIMAL(14,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL,
    "vat_amount" DECIMAL(14,2) NOT NULL,
    "amount_incl_tax" DECIMAL(14,2) NOT NULL,
    "agent_user_id" TEXT,
    "agent_share_percent" DECIMAL(7,4),
    "status" "SaleCommissionStatus" NOT NULL DEFAULT 'DUE',
    "issued_at" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_commission_payments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "commission_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "payment_method" "RentalPaymentMethod" NOT NULL,
    "treasury_account_id" UUID NOT NULL,
    "reference" TEXT,
    "status" "SaleCommissionPaymentStatus" NOT NULL DEFAULT 'POSTED',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_user_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_commission_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_mandates_tenant_id_status_idx" ON "sale_mandates"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sale_mandates_tenant_id_property_id_idx" ON "sale_mandates"("tenant_id", "property_id");

-- CreateIndex
CREATE INDEX "sale_mandates_seller_client_id_idx" ON "sale_mandates"("seller_client_id");

-- CreateIndex
CREATE INDEX "sale_mandates_agent_user_id_idx" ON "sale_mandates"("agent_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_mandates_tenant_id_year_sequence_key" ON "sale_mandates"("tenant_id", "year", "sequence");

-- CreateIndex
CREATE INDEX "sale_offers_tenant_id_status_idx" ON "sale_offers"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sale_offers_mandate_id_idx" ON "sale_offers"("mandate_id");

-- CreateIndex
CREATE INDEX "sale_offers_buyer_contact_id_idx" ON "sale_offers"("buyer_contact_id");

-- CreateIndex
CREATE INDEX "sale_offers_deal_id_idx" ON "sale_offers"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_offers_tenant_id_year_sequence_key" ON "sale_offers"("tenant_id", "year", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "sale_agreements_offer_id_key" ON "sale_agreements"("offer_id");

-- CreateIndex
CREATE INDEX "sale_agreements_tenant_id_status_idx" ON "sale_agreements"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sale_agreements_mandate_id_idx" ON "sale_agreements"("mandate_id");

-- CreateIndex
CREATE INDEX "sale_agreements_property_id_idx" ON "sale_agreements"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_agreements_tenant_id_year_sequence_key" ON "sale_agreements"("tenant_id", "year", "sequence");

-- CreateIndex
CREATE INDEX "sale_agreement_conditions_tenant_id_idx" ON "sale_agreement_conditions"("tenant_id");

-- CreateIndex
CREATE INDEX "sale_agreement_conditions_agreement_id_idx" ON "sale_agreement_conditions"("agreement_id");

-- CreateIndex
CREATE INDEX "sale_payment_milestones_tenant_id_idx" ON "sale_payment_milestones"("tenant_id");

-- CreateIndex
CREATE INDEX "sale_payment_milestones_agreement_id_idx" ON "sale_payment_milestones"("agreement_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_commissions_agreement_id_key" ON "sale_commissions"("agreement_id");

-- CreateIndex
CREATE INDEX "sale_commissions_tenant_id_status_idx" ON "sale_commissions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sale_commissions_mandate_id_idx" ON "sale_commissions"("mandate_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_commissions_tenant_id_year_sequence_key" ON "sale_commissions"("tenant_id", "year", "sequence");

-- CreateIndex
CREATE INDEX "sale_commission_payments_tenant_id_status_idx" ON "sale_commission_payments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "sale_commission_payments_commission_id_idx" ON "sale_commission_payments"("commission_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_commission_payments_tenant_id_year_sequence_key" ON "sale_commission_payments"("tenant_id", "year", "sequence");

-- AddForeignKey
ALTER TABLE "sale_mandates" ADD CONSTRAINT "sale_mandates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_mandates" ADD CONSTRAINT "sale_mandates_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_mandates" ADD CONSTRAINT "sale_mandates_seller_client_id_fkey" FOREIGN KEY ("seller_client_id") REFERENCES "tenant_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_mandates" ADD CONSTRAINT "sale_mandates_agent_user_id_fkey" FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_mandates" ADD CONSTRAINT "sale_mandates_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_offers" ADD CONSTRAINT "sale_offers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_offers" ADD CONSTRAINT "sale_offers_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "sale_mandates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_offers" ADD CONSTRAINT "sale_offers_buyer_contact_id_fkey" FOREIGN KEY ("buyer_contact_id") REFERENCES "crm_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_offers" ADD CONSTRAINT "sale_offers_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "crm_deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_offers" ADD CONSTRAINT "sale_offers_decided_by_user_id_fkey" FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_agreements" ADD CONSTRAINT "sale_agreements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_agreements" ADD CONSTRAINT "sale_agreements_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "sale_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_agreements" ADD CONSTRAINT "sale_agreements_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "sale_mandates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_agreements" ADD CONSTRAINT "sale_agreements_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_agreements" ADD CONSTRAINT "sale_agreements_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_agreement_conditions" ADD CONSTRAINT "sale_agreement_conditions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_agreement_conditions" ADD CONSTRAINT "sale_agreement_conditions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "sale_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payment_milestones" ADD CONSTRAINT "sale_payment_milestones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payment_milestones" ADD CONSTRAINT "sale_payment_milestones_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "sale_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_commissions" ADD CONSTRAINT "sale_commissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_commissions" ADD CONSTRAINT "sale_commissions_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "sale_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_commissions" ADD CONSTRAINT "sale_commissions_mandate_id_fkey" FOREIGN KEY ("mandate_id") REFERENCES "sale_mandates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_commissions" ADD CONSTRAINT "sale_commissions_agent_user_id_fkey" FOREIGN KEY ("agent_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_commission_payments" ADD CONSTRAINT "sale_commission_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_commission_payments" ADD CONSTRAINT "sale_commission_payments_commission_id_fkey" FOREIGN KEY ("commission_id") REFERENCES "sale_commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_commission_payments" ADD CONSTRAINT "sale_commission_payments_voided_by_user_id_fkey" FOREIGN KEY ("voided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_commission_payments" ADD CONSTRAINT "sale_commission_payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

