-- CreateEnum
CREATE TYPE "PaymentGatewayProvider" AS ENUM ('PAYSECUREHUB');

-- CreateEnum
CREATE TYPE "PaymentGatewayMode" AS ENUM ('SIMULATOR', 'LIVE');

-- CreateEnum
CREATE TYPE "PaymentGatewayFeesPayer" AS ENUM ('CLIENT', 'AGENCY');

-- CreateEnum
CREATE TYPE "OnlineCheckoutStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'EXPIRED', 'REVIEW');

-- CreateTable
CREATE TABLE "payment_gateway_configs" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" "PaymentGatewayProvider" NOT NULL DEFAULT 'PAYSECUREHUB',
    "mode" "PaymentGatewayMode" NOT NULL DEFAULT 'SIMULATOR',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "merchant_id" TEXT,
    "api_key_encrypted" TEXT,
    "api_key_last4" TEXT,
    "treasury_account_id" UUID,
    "fees_paid_by" "PaymentGatewayFeesPayer" NOT NULL DEFAULT 'CLIENT',
    "last_test_at" TIMESTAMP(3),
    "last_test_ok" BOOLEAN,
    "last_test_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_payment_checkouts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payment_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "renter_client_id" TEXT NOT NULL,
    "provider" "PaymentGatewayProvider" NOT NULL,
    "mode" "PaymentGatewayMode" NOT NULL,
    "code_paiement" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "installment_ids" TEXT[],
    "checkout_url" TEXT,
    "provider_token" TEXT,
    "provider_transaction_id" TEXT,
    "provider_service_name" TEXT,
    "provider_fees" DECIMAL(12,2),
    "status" "OnlineCheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "last_provider_state" TEXT,
    "last_provider_payload" JSONB,
    "last_checked_at" TIMESTAMP(3),
    "check_attempts" INTEGER NOT NULL DEFAULT 0,
    "failure_message" TEXT,
    "review_reason" TEXT,
    "simulated_outcome" TEXT,
    "created_by_user_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_payment_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_configs_tenant_id_key" ON "payment_gateway_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "online_payment_checkouts_payment_id_key" ON "online_payment_checkouts"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "online_payment_checkouts_code_paiement_key" ON "online_payment_checkouts"("code_paiement");

-- CreateIndex
CREATE INDEX "online_payment_checkouts_tenant_id_status_idx" ON "online_payment_checkouts"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "payment_gateway_configs" ADD CONSTRAINT "payment_gateway_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payment_checkouts" ADD CONSTRAINT "online_payment_checkouts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payment_checkouts" ADD CONSTRAINT "online_payment_checkouts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "rental_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

