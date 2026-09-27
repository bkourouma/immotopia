-- CreateEnum
CREATE TYPE "SyndicChargeReceiptKind" AS ENUM ('RECEIPT', 'QUITTANCE');

-- CreateTable
CREATE TABLE "syndic_charge_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "syndicate_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "contact_id" TEXT,
    "kind" "SyndicChargeReceiptKind" NOT NULL,
    "number" TEXT NOT NULL,
    "issuer_key" TEXT NOT NULL,
    "charge_payment_id" UUID,
    "charge_call_id" UUID,
    "period_start" DATE,
    "period_end" DATE,
    "period_label" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "snapshot" JSONB NOT NULL,
    "file_path" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailed_at" TIMESTAMP(3),
    "email_error" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syndic_charge_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndic_receipt_sequences" (
    "tenant_id" TEXT NOT NULL,
    "issuer_key" TEXT NOT NULL,
    "kind" "SyndicChargeReceiptKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syndic_receipt_sequences_pkey" PRIMARY KEY ("tenant_id","issuer_key","kind","year")
);

-- CreateIndex
CREATE INDEX "syndic_charge_receipts_tenant_id_syndicate_id_issued_at_idx" ON "syndic_charge_receipts"("tenant_id", "syndicate_id", "issued_at");

-- CreateIndex
CREATE INDEX "syndic_charge_receipts_lot_id_issued_at_idx" ON "syndic_charge_receipts"("lot_id", "issued_at");

-- CreateIndex
CREATE INDEX "syndic_charge_receipts_charge_call_id_idx" ON "syndic_charge_receipts"("charge_call_id");

-- CreateIndex
CREATE INDEX "syndic_charge_receipts_charge_payment_id_idx" ON "syndic_charge_receipts"("charge_payment_id");

-- CreateIndex
CREATE INDEX "syndic_charge_receipts_contact_id_idx" ON "syndic_charge_receipts"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "syndic_charge_receipts_tenant_id_issuer_key_number_key" ON "syndic_charge_receipts"("tenant_id", "issuer_key", "number");

-- AddForeignKey
ALTER TABLE "syndic_charge_receipts" ADD CONSTRAINT "syndic_charge_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_charge_receipts" ADD CONSTRAINT "syndic_charge_receipts_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_charge_receipts" ADD CONSTRAINT "syndic_charge_receipts_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_charge_receipts" ADD CONSTRAINT "syndic_charge_receipts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_charge_receipts" ADD CONSTRAINT "syndic_charge_receipts_charge_payment_id_fkey" FOREIGN KEY ("charge_payment_id") REFERENCES "charge_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_charge_receipts" ADD CONSTRAINT "syndic_charge_receipts_charge_call_id_fkey" FOREIGN KEY ("charge_call_id") REFERENCES "charge_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_receipt_sequences" ADD CONSTRAINT "syndic_receipt_sequences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Lot S3 : une seule QUITTANCE par appel de charges (un recu, lui, peut
-- toucher plusieurs appels et n'est pas concerne). Index unique PARTIEL, non
-- exprimable dans schema.prisma : si une future commande `prisma migrate dev`
-- propose de le supprimer, c'est ce manque d'expressivite qui parle, pas un
-- changement voulu — retirer la ligne de la migration generee.
CREATE UNIQUE INDEX "syndic_charge_receipts_quittance_call_key" ON "syndic_charge_receipts"("charge_call_id") WHERE "kind" = 'QUITTANCE' AND "charge_call_id" IS NOT NULL;
