-- Spec 043 (signature electronique, lot S1) : modeles du noyau, signature d'un
-- bail. La valeur CapacityKey.SIGNATURES_MENSUELLES vient de la migration
-- precedente (20261015100000_signature_enums).

-- CreateEnum
CREATE TYPE "SignatureDocumentKind" AS ENUM ('LEASE_CONTRACT', 'MANAGEMENT_MANDATE', 'SALE_MANDATE', 'LEASE_INSPECTION', 'SALE_AGREEMENT');

-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_SIGNED', 'COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SignatureSignerStatus" AS ENUM ('PENDING', 'OPENED', 'SIGNED', 'DECLINED');

-- CreateEnum
CREATE TYPE "SignatureChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS', 'IN_PERSON');


-- AlterTable
ALTER TABLE "rental_leases" ADD COLUMN     "signature_request_id" UUID,
ADD COLUMN     "signed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" "SignatureDocumentKind" NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" VARCHAR(2) NOT NULL DEFAULT 'fr',
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "provider_id" TEXT NOT NULL,
    "provider_ref" TEXT,
    "source_document_id" TEXT,
    "source_file_key" TEXT NOT NULL,
    "source_hash" CHAR(64) NOT NULL,
    "signed_file_key" TEXT,
    "signed_hash" CHAR(64),
    "sequential" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "sealing_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "last_reminder_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_signers" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "request_id" UUID NOT NULL,
    "role" VARCHAR(40) NOT NULL,
    "position" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "channel" "SignatureChannel" NOT NULL,
    "contact" TEXT NOT NULL,
    "contact_id" TEXT,
    "status" "SignatureSignerStatus" NOT NULL DEFAULT 'PENDING',
    "token_hash" CHAR(64) NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "otp_hash" CHAR(64),
    "otp_expires_at" TIMESTAMP(3),
    "otp_attempts" INTEGER NOT NULL DEFAULT 0,
    "otp_sends" INTEGER NOT NULL DEFAULT 0,
    "otp_last_sent_at" TIMESTAMP(3),
    "invite_status" VARCHAR(20) NOT NULL DEFAULT 'WAITING',
    "opened_at" TIMESTAMP(3),
    "signature_mode" VARCHAR(10),
    "signature_typed" TEXT,
    "signature_image_key" TEXT,
    "consent_text_hash" CHAR(64),
    "signed_at" TIMESTAMP(3),
    "ip_hash" CHAR(64),
    "ip_truncated" VARCHAR(64),
    "user_agent" VARCHAR(200),
    "decline_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_events" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "request_id" UUID NOT NULL,
    "signer_id" UUID,
    "seq" INTEGER NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "payload" JSONB,
    "prev_hash" CHAR(64),
    "event_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_usages" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "month" CHAR(7) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signature_requests_tenant_id_status_idx" ON "signature_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "signature_requests_tenant_id_target_type_target_id_idx" ON "signature_requests"("tenant_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "signature_requests_status_expires_at_idx" ON "signature_requests"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "signature_signers_token_hash_key" ON "signature_signers"("token_hash");

-- CreateIndex
CREATE INDEX "signature_signers_tenant_id_request_id_idx" ON "signature_signers"("tenant_id", "request_id");

-- CreateIndex
CREATE INDEX "signature_events_tenant_id_request_id_idx" ON "signature_events"("tenant_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "signature_events_request_id_seq_key" ON "signature_events"("request_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "signature_usages_tenant_id_month_key" ON "signature_usages"("tenant_id", "month");

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_signers" ADD CONSTRAINT "signature_signers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_signers" ADD CONSTRAINT "signature_signers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "signature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_events" ADD CONSTRAINT "signature_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "signature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_usages" ADD CONSTRAINT "signature_usages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Contraintes ajoutees a la main
-- ---------------------------------------------------------------------------

-- SG-R12 : le compteur mensuel ne descend jamais sous zero.
ALTER TABLE "signature_usages" ADD CONSTRAINT "signature_usages_used_non_negative"
  CHECK ("used" >= 0);

-- SG-R2 : une seule demande ouverte par document et par nature (deux envois
-- simultanes du meme bail ne creent pas deux demandes concurrentes).
CREATE UNIQUE INDEX "signature_requests_one_open_per_target"
  ON "signature_requests" ("tenant_id", "target_type", "target_id", "kind")
  WHERE "status" IN ('DRAFT', 'SENT', 'PARTIALLY_SIGNED');

-- SG-R8 : la piste de preuve est append-only. Une modification d'un evenement
-- est refusee par la base elle-meme (la suppression en cascade avec la demande
-- ou l'agence reste possible).
CREATE OR REPLACE FUNCTION "signature_events_refuse_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'signature_events est append-only : modification refusee';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "signature_events_append_only"
  BEFORE UPDATE ON "signature_events"
  FOR EACH ROW EXECUTE FUNCTION "signature_events_refuse_update"();
