-- Spec 047 : paiement mobile money declare (numeros de reception, reglages, declarations,
-- lignes par lot, lectures IA de captures).
-- Migration additive : deux enums et cinq tables neufs, aucune donnee existante reprise.
-- La valeur DECLARED de "ChargePaymentOrigin" est ajoutee par la migration precedente
-- (20261017150000).

-- CreateEnum
CREATE TYPE "SyndicDeclarationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SyndicDeclarationRejectReason" AS ENUM ('NOT_FOUND', 'AMOUNT_MISMATCH', 'REFERENCE_USED', 'WRONG_NUMBER', 'OTHER');

-- CreateTable
CREATE TABLE "syndic_receiving_numbers" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "syndicate_id" UUID NOT NULL,
    "operator" "MobileMoneyOperator" NOT NULL,
    "phone_number" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "label" TEXT,
    "treasury_account_number" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syndic_receiving_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndic_declared_payment_settings" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "syndicate_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "review_alert_business_days" INTEGER NOT NULL DEFAULT 3,
    "proof_required" BOOLEAN NOT NULL DEFAULT false,
    "payer_instructions" VARCHAR(500),
    "ai_prefill_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syndic_declared_payment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndic_payment_declarations" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "syndicate_id" UUID NOT NULL,
    "receiving_number_id" UUID NOT NULL,
    "receiving_operator" "MobileMoneyOperator" NOT NULL,
    "receiving_phone" TEXT NOT NULL,
    "receiving_holder_name" TEXT NOT NULL,
    "declared_by_contact_id" TEXT,
    "declared_by_user_id" TEXT,
    "payer_phone" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "transaction_reference" TEXT NOT NULL,
    "comment" VARCHAR(500),
    "proof_file_url" TEXT,
    "proof_sha256" TEXT,
    "proof_read_id" UUID,
    "ai_prefill" JSONB,
    "ai_edited_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "SyndicDeclarationStatus" NOT NULL DEFAULT 'PENDING',
    "accepted_amount" DECIMAL(14,2),
    "accepted_paid_at" TIMESTAMP(3),
    "reject_reason" "SyndicDeclarationRejectReason",
    "review_note" VARCHAR(500),
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syndic_payment_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndic_payment_declaration_lines" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "declaration_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "accepted_amount" DECIMAL(14,2),
    "charge_call_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "charge_payment_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syndic_payment_declaration_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndic_payment_proof_reads" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "syndicate_id" UUID NOT NULL,
    "contact_id" TEXT NOT NULL,
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

    CONSTRAINT "syndic_payment_proof_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "syndic_receiving_numbers_tenant_id_phone_number_idx" ON "syndic_receiving_numbers"("tenant_id", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "syndic_receiving_numbers_syndicate_id_operator_phone_number_key" ON "syndic_receiving_numbers"("syndicate_id", "operator", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "syndic_declared_payment_settings_syndicate_id_key" ON "syndic_declared_payment_settings"("syndicate_id");

-- CreateIndex
CREATE INDEX "syndic_declared_payment_settings_tenant_id_idx" ON "syndic_declared_payment_settings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "syndic_payment_declarations_proof_read_id_key" ON "syndic_payment_declarations"("proof_read_id");

-- CreateIndex
CREATE INDEX "syndic_payment_declarations_tenant_id_syndicate_id_status_c_idx" ON "syndic_payment_declarations"("tenant_id", "syndicate_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "syndic_payment_declarations_receiving_number_id_transaction_idx" ON "syndic_payment_declarations"("receiving_number_id", "transaction_reference");

-- CreateIndex
CREATE UNIQUE INDEX "syndic_payment_declaration_lines_charge_payment_id_key" ON "syndic_payment_declaration_lines"("charge_payment_id");

-- CreateIndex
CREATE INDEX "syndic_payment_declaration_lines_lot_id_idx" ON "syndic_payment_declaration_lines"("lot_id");

-- CreateIndex
CREATE INDEX "syndic_payment_declaration_lines_tenant_id_idx" ON "syndic_payment_declaration_lines"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "syndic_payment_declaration_lines_declaration_id_lot_id_key" ON "syndic_payment_declaration_lines"("declaration_id", "lot_id");

-- CreateIndex
CREATE INDEX "syndic_payment_proof_reads_tenant_id_created_at_idx" ON "syndic_payment_proof_reads"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "syndic_payment_proof_reads_contact_id_created_at_idx" ON "syndic_payment_proof_reads"("contact_id", "created_at");

-- CreateIndex
CREATE INDEX "syndic_payment_proof_reads_expires_at_idx" ON "syndic_payment_proof_reads"("expires_at");

-- Index unique PARTIEL, ecrit a la main : Prisma ne sait pas exprimer une clause WHERE sur un
-- index. Ne pas le supprimer lors d'un prochain `migrate dev` / `migrate diff`.
-- Une meme reference de transaction ne peut etre declaree qu'une fois sur un numero de reception
-- tant que la declaration est en attente ou validee (REJECTED ou CANCELED libere la reference).
-- La portee est l'agence (tenant_id) : elle tient pour un numero partage entre coproprietes (D10)
-- et arbitre les declarations concurrentes (R10).
CREATE UNIQUE INDEX "syndic_payment_declarations_ref_active_uq"
    ON "syndic_payment_declarations" ("tenant_id", "receiving_phone", "transaction_reference")
    WHERE "status" IN ('PENDING', 'APPROVED');

-- AddForeignKey
ALTER TABLE "syndic_receiving_numbers" ADD CONSTRAINT "syndic_receiving_numbers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_receiving_numbers" ADD CONSTRAINT "syndic_receiving_numbers_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_declared_payment_settings" ADD CONSTRAINT "syndic_declared_payment_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_declared_payment_settings" ADD CONSTRAINT "syndic_declared_payment_settings_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_payment_declarations" ADD CONSTRAINT "syndic_payment_declarations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_payment_declarations" ADD CONSTRAINT "syndic_payment_declarations_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_payment_declarations" ADD CONSTRAINT "syndic_payment_declarations_receiving_number_id_fkey" FOREIGN KEY ("receiving_number_id") REFERENCES "syndic_receiving_numbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_payment_declarations" ADD CONSTRAINT "syndic_payment_declarations_proof_read_id_fkey" FOREIGN KEY ("proof_read_id") REFERENCES "syndic_payment_proof_reads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_payment_declaration_lines" ADD CONSTRAINT "syndic_payment_declaration_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_payment_declaration_lines" ADD CONSTRAINT "syndic_payment_declaration_lines_declaration_id_fkey" FOREIGN KEY ("declaration_id") REFERENCES "syndic_payment_declarations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_payment_declaration_lines" ADD CONSTRAINT "syndic_payment_declaration_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_payment_declaration_lines" ADD CONSTRAINT "syndic_payment_declaration_lines_charge_payment_id_fkey" FOREIGN KEY ("charge_payment_id") REFERENCES "charge_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_payment_proof_reads" ADD CONSTRAINT "syndic_payment_proof_reads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_payment_proof_reads" ADD CONSTRAINT "syndic_payment_proof_reads_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
