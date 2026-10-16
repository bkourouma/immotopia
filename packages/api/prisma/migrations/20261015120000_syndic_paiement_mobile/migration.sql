-- Spec 042 : paiement Mobile Money des coproprietaires (compte marchand par copropriete,
-- tentatives de paiement en ligne, idempotence des paiements de charges).
-- Migration additive : deux tables et quatre enums neufs, trois colonnes nullables / a defaut
-- sur charge_payments (aucune donnee existante reprise). La valeur d'enum CHARGE_CALL_PAYMENT de
-- "SecureLinkScope" est ajoutee par la migration precedente (20261015115900).

-- CreateEnum
CREATE TYPE "ChargePaymentOrigin" AS ENUM ('MANUAL', 'ONLINE');

-- CreateEnum
CREATE TYPE "SyndicCheckoutOrigin" AS ENUM ('PORTAL', 'SECURE_LINK');

-- CreateEnum
CREATE TYPE "SyndicReviewKind" AS ENUM ('AMOUNT_MISMATCH', 'FISCAL_YEAR_CLOSED', 'CALLS_UNAVAILABLE', 'DUPLICATE_TRANSACTION', 'CONTRARY_STATE');

-- CreateEnum
CREATE TYPE "SyndicCheckoutResolution" AS ENUM ('ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "charge_payments" ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "origin" "ChargePaymentOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "provider_transaction_id" TEXT;

-- CreateTable
CREATE TABLE "syndic_payment_gateway_configs" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "syndicate_id" UUID NOT NULL,
    "provider" "PaymentGatewayProvider" NOT NULL DEFAULT 'PAYSECUREHUB',
    "mode" "PaymentGatewayMode" NOT NULL DEFAULT 'SIMULATOR',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "merchant_id" TEXT,
    "api_key_encrypted" TEXT,
    "api_key_last4" TEXT,
    "last_test_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "last_test_message" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syndic_payment_gateway_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndic_online_checkouts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "syndicate_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "config_id" UUID NOT NULL,
    "origin" "SyndicCheckoutOrigin" NOT NULL,
    "tenant_client_id" TEXT,
    "secure_link_id" TEXT,
    "contact_id" TEXT,
    "code_paiement" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "charge_call_ids" TEXT[],
    "checkout_url" TEXT,
    "provider_token" TEXT,
    "provider_transaction_id" TEXT,
    "provider_service_name" TEXT,
    "provider_fees" DECIMAL(12,2),
    "received_amount" DECIMAL(14,2),
    "mm_operator" "MobileMoneyOperator",
    "status" "OnlineCheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "last_provider_state" TEXT,
    "last_provider_payload" JSONB,
    "last_checked_at" TIMESTAMP(3),
    "check_attempts" INTEGER NOT NULL DEFAULT 0,
    "failure_message" TEXT,
    "review_reason" TEXT,
    "review_kind" "SyndicReviewKind",
    "simulated_outcome" TEXT,
    "charge_payment_id" UUID,
    "resolved_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution" "SyndicCheckoutResolution",
    "resolution_note" TEXT,
    "created_by_user_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syndic_online_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "syndic_payment_gateway_configs_syndicate_id_key" ON "syndic_payment_gateway_configs"("syndicate_id");

-- CreateIndex
CREATE INDEX "syndic_payment_gateway_configs_tenant_id_idx" ON "syndic_payment_gateway_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "syndic_online_checkouts_code_paiement_key" ON "syndic_online_checkouts"("code_paiement");

-- CreateIndex
CREATE UNIQUE INDEX "syndic_online_checkouts_charge_payment_id_key" ON "syndic_online_checkouts"("charge_payment_id");

-- CreateIndex
CREATE INDEX "syndic_online_checkouts_tenant_id_status_idx" ON "syndic_online_checkouts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "syndic_online_checkouts_syndicate_id_status_idx" ON "syndic_online_checkouts"("syndicate_id", "status");

-- CreateIndex
CREATE INDEX "syndic_online_checkouts_lot_id_idx" ON "syndic_online_checkouts"("lot_id");

-- CreateIndex
CREATE INDEX "syndic_online_checkouts_tenant_id_secure_link_id_idx" ON "syndic_online_checkouts"("tenant_id", "secure_link_id");

-- CreateIndex
CREATE INDEX "syndic_online_checkouts_syndicate_id_created_at_idx" ON "syndic_online_checkouts"("syndicate_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "charge_payments_idempotency_key_key" ON "charge_payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "charge_payments_provider_transaction_id_key" ON "charge_payments"("provider_transaction_id");

-- AddForeignKey
ALTER TABLE "syndic_payment_gateway_configs" ADD CONSTRAINT "syndic_payment_gateway_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_payment_gateway_configs" ADD CONSTRAINT "syndic_payment_gateway_configs_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_online_checkouts" ADD CONSTRAINT "syndic_online_checkouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_online_checkouts" ADD CONSTRAINT "syndic_online_checkouts_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_online_checkouts" ADD CONSTRAINT "syndic_online_checkouts_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_online_checkouts" ADD CONSTRAINT "syndic_online_checkouts_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "syndic_payment_gateway_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_online_checkouts" ADD CONSTRAINT "syndic_online_checkouts_charge_payment_id_fkey" FOREIGN KEY ("charge_payment_id") REFERENCES "charge_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

