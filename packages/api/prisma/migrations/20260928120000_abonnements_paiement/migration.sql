-- Vague 3, lot B : paiement de l'abonnement (PaySecureHub ImmoTopia et
-- constat manuel) et demandes d'extension. Additive, sans cle etrangere
-- (comme audit_logs) : les identifiants survivent aux suppressions.

CREATE TYPE "PlatformPaymentMethod" AS ENUM ('ONLINE', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHECK', 'CASH');
CREATE TYPE "SubscriptionExtensionRequestStatus" AS ENUM ('OPEN', 'HANDLED', 'DECLINED');

CREATE TABLE "platform_invoice_payments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "method" "PlatformPaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "proof_path" TEXT,
    "proof_name" TEXT,
    "proof_mime_type" TEXT,
    "checkout_id" UUID,
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_invoice_payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_invoice_payments_invoice_id_key" ON "platform_invoice_payments"("invoice_id");
CREATE INDEX "platform_invoice_payments_tenant_id_idx" ON "platform_invoice_payments"("tenant_id");

CREATE TABLE "platform_payment_checkouts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "provider" "PaymentGatewayProvider" NOT NULL DEFAULT 'PAYSECUREHUB',
    "mode" "PaymentGatewayMode" NOT NULL,
    "code_paiement" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
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
    CONSTRAINT "platform_payment_checkouts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_payment_checkouts_code_paiement_key" ON "platform_payment_checkouts"("code_paiement");
CREATE INDEX "platform_payment_checkouts_tenant_id_status_idx" ON "platform_payment_checkouts"("tenant_id", "status");
CREATE INDEX "platform_payment_checkouts_invoice_id_idx" ON "platform_payment_checkouts"("invoice_id");

CREATE TABLE "subscription_extension_requests" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT,
    "catalog_code" TEXT,
    "quantity" INTEGER,
    "message" TEXT NOT NULL,
    "status" "SubscriptionExtensionRequestStatus" NOT NULL DEFAULT 'OPEN',
    "handled_at" TIMESTAMP(3),
    "handled_by_user_id" TEXT,
    "handled_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscription_extension_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "subscription_extension_requests_tenant_id_status_idx" ON "subscription_extension_requests"("tenant_id", "status");
