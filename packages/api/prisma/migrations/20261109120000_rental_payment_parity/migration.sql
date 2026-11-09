-- CreateEnum
CREATE TYPE "RentalPaymentRejectReason" AS ENUM ('NOT_FOUND', 'AMOUNT_MISMATCH', 'REFERENCE_USED', 'WRONG_NUMBER', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalOnlineReviewKind" AS ENUM ('AMOUNT_MISMATCH', 'CONTRARY_STATE', 'DUPLICATE_TRANSACTION', 'INSTALLMENT_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "RentalOnlineReviewResolution" AS ENUM ('ACCEPT', 'REJECT');

-- AlterTable
ALTER TABLE "online_payment_checkouts" ADD COLUMN     "resolution" "RentalOnlineReviewResolution",
ADD COLUMN     "resolution_note" TEXT,
ADD COLUMN     "resolved_at" TIMESTAMP(3),
ADD COLUMN     "resolved_by_user_id" TEXT,
ADD COLUMN     "review_kind" "RentalOnlineReviewKind",
ADD COLUMN     "received_amount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "rental_payment_declarations" ADD COLUMN     "accepted_amount" DECIMAL(12,2),
ADD COLUMN     "correction_note" TEXT,
ADD COLUMN     "declared_by_user_id" TEXT,
ADD COLUMN     "ai_prefilled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_edited_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "canceled_at" TIMESTAMP(3),
ADD COLUMN     "proof_read_id" UUID,
ADD COLUMN     "receiving_number_id" UUID,
ADD COLUMN     "receiving_phone" TEXT,
ADD COLUMN     "reference_normalized" TEXT,
ADD COLUMN     "reject_reason" "RentalPaymentRejectReason",
ADD COLUMN     "review_alerted_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "rental_receiving_numbers" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "operator" "MobileMoneyOperator" NOT NULL,
    "phone" TEXT NOT NULL,
    "label" TEXT,
    "treasury_account_number" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_receiving_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_declared_payment_settings" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "proof_required" BOOLEAN NOT NULL DEFAULT false,
    "ai_prefill_enabled" BOOLEAN NOT NULL DEFAULT false,
    "review_alert_business_days" INTEGER NOT NULL DEFAULT 3,
    "payer_instructions" VARCHAR(500),
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_declared_payment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_payment_proof_reads" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "renter_client_id" TEXT NOT NULL,
    "temp_file_url" TEXT,
    "sha256" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "result" JSONB,
    "latency_ms" INTEGER NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_payment_proof_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_payment_reminders" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "installment_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "level" INTEGER NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "status" "ReminderStatus" NOT NULL,
    "sent_by" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "payment_link_id" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_payment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rental_receiving_numbers_tenant_id_phone_idx" ON "rental_receiving_numbers"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "rental_receiving_numbers_tenant_id_operator_phone_key" ON "rental_receiving_numbers"("tenant_id", "operator", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "rental_declared_payment_settings_tenant_id_key" ON "rental_declared_payment_settings"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_payment_proof_reads_tenant_id_created_at_idx" ON "rental_payment_proof_reads"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "rental_payment_proof_reads_renter_client_id_created_at_idx" ON "rental_payment_proof_reads"("renter_client_id", "created_at");

-- CreateIndex
CREATE INDEX "rental_payment_proof_reads_expires_at_idx" ON "rental_payment_proof_reads"("expires_at");

-- CreateIndex
CREATE INDEX "rental_payment_reminders_tenant_id_idx" ON "rental_payment_reminders"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_payment_reminders_installment_id_level_idx" ON "rental_payment_reminders"("installment_id", "level");

-- CreateIndex
CREATE INDEX "rental_payment_reminders_lease_id_idx" ON "rental_payment_reminders"("lease_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_payment_declarations_proof_read_id_key" ON "rental_payment_declarations"("proof_read_id");

-- CreateIndex
CREATE INDEX "rental_payment_declarations_receiving_number_id_idx" ON "rental_payment_declarations"("receiving_number_id");

-- CreateIndex
CREATE INDEX "rental_payment_declarations_tenant_id_status_created_at_idx" ON "rental_payment_declarations"("tenant_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "rental_payment_declarations" ADD CONSTRAINT "rental_payment_declarations_receiving_number_id_fkey" FOREIGN KEY ("receiving_number_id") REFERENCES "rental_receiving_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payment_declarations" ADD CONSTRAINT "rental_payment_declarations_proof_read_id_fkey" FOREIGN KEY ("proof_read_id") REFERENCES "rental_payment_proof_reads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payment_reminders" ADD CONSTRAINT "rental_payment_reminders_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payment_reminders" ADD CONSTRAINT "rental_payment_reminders_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Index unique partiel maintenu a la main (Prisma ne sait pas l'exprimer) :
-- une meme reference de transaction ne peut etre PENDING ou APPROVED qu'une fois par numero de reception.
CREATE UNIQUE INDEX "rental_payment_declarations_pending_approved_ref_key" ON "rental_payment_declarations" ("tenant_id", "receiving_phone", "reference_normalized") WHERE "status" IN ('PENDING','APPROVED') AND "reference_normalized" IS NOT NULL;
