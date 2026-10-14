-- Lot 041 (spec 041, data-model §5, migration 2) : inventaire de chantier par
-- WhatsApp et IA.
-- Generee SANS base par `prisma migrate diff --from-schema-datamodel <schema
-- de feat/inventaire-whatsapp avant le lot 041, migrations du lot 040
-- comprises> --to-schema-datamodel prisma/schema.prisma --script` ; les
-- ALTER TYPE ... ADD VALUE produits par le diff sont dans la migration 1
-- (20261009090000_inventaire_whatsapp_enums). Contraintes non exprimables en
-- Prisma ajoutees a la main en fin de fichier (data-model §5.2).
--
-- Additive : enumerations et tables neuves, une colonne avec defaut sur
-- stock_counts (aucune reecriture de ligne existante). Aucun rattrapage.

-- CreateEnum
CREATE TYPE "StockCountSource" AS ENUM ('WEB', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "StockWhatsappRegistrationStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "StockWhatsappSessionState" AS ENUM ('AWAITING_SITE', 'ANALYZING', 'AWAITING_ITEM', 'AWAITING_CONFIRMATION', 'AWAITING_MERGE', 'READY', 'CLOSED');

-- CreateEnum
CREATE TYPE "StockWhatsappSessionCloseReason" AS ENUM ('FIN', 'SITE_CHANGE', 'TIMEOUT', 'ACCESS_LOST', 'REVOKED', 'NO_SITE');

-- CreateEnum
CREATE TYPE "StockWhatsappMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "StockWhatsappMessageKind" AS ENUM ('TEXT', 'IMAGE', 'BUTTONS', 'LIST', 'REPLY', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "StockFieldCaptureOutcome" AS ENUM ('RECEIVED', 'PENDING', 'ACCEPTED', 'CORRECTED', 'CANCELLED', 'EXPIRED', 'UNREADABLE', 'UNRECOGNIZED', 'FAILED');

-- CreateEnum
CREATE TYPE "StockVisionQuality" AS ENUM ('OK', 'TOO_DARK', 'BLURRY', 'NOT_STOCK');

-- CreateEnum
CREATE TYPE "StockVisionMethod" AS ENUM ('SACKS_STACKED', 'BARS_BUNDLE', 'BLOCKS_PALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "WhatsappCloudEventKind" AS ENUM ('MESSAGE', 'STATUS', 'OTHER');

-- CreateEnum
CREATE TYPE "WhatsappCloudEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsappInboundVia" AS ENUM ('META', 'SIMULATOR');

-- AlterTable
ALTER TABLE "stock_counts" ADD COLUMN     "source" "StockCountSource" NOT NULL DEFAULT 'WEB';

-- CreateTable
CREATE TABLE "stock_whatsapp_registrations" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "status" "StockWhatsappRegistrationStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "activation_code_hash" CHAR(64),
    "activation_expires_at" TIMESTAMP(3),
    "activation_attempts" INTEGER NOT NULL DEFAULT 0,
    "activated_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" TEXT,
    "revoke_reason" TEXT,
    "last_inbound_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_whatsapp_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_whatsapp_registration_sites" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "registration_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_whatsapp_registration_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_whatsapp_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "registration_id" UUID NOT NULL,
    "state" "StockWhatsappSessionState" NOT NULL,
    "site_id" UUID,
    "location_id" UUID,
    "count_id" UUID,
    "pending_capture_id" UUID,
    "last_inbound_at" TIMESTAMP(3) NOT NULL,
    "reminder_sent_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "close_reason" "StockWhatsappSessionCloseReason",
    "count_outcome" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_whatsapp_messages" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "registration_id" UUID NOT NULL,
    "session_id" UUID,
    "capture_id" UUID,
    "direction" "StockWhatsappMessageDirection" NOT NULL,
    "kind" "StockWhatsappMessageKind" NOT NULL,
    "text" VARCHAR(1000),
    "interactive" JSONB,
    "meta_message_id" TEXT,
    "via" "WhatsappInboundVia",
    "send_error" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_field_captures" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "registration_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "site_id" UUID,
    "location_id" UUID,
    "count_id" UUID,
    "count_line_id" UUID,
    "item_id" UUID,
    "item_imposed" BOOLEAN NOT NULL DEFAULT false,
    "outcome" "StockFieldCaptureOutcome" NOT NULL DEFAULT 'RECEIVED',
    "via" "WhatsappInboundVia" NOT NULL,
    "meta_message_id" TEXT,
    "file_url" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "provider_sha256" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vision_provider" TEXT,
    "vision_model" TEXT,
    "analyzed_at" TIMESTAMP(3),
    "analysis_ms" INTEGER,
    "quality" "StockVisionQuality",
    "method" "StockVisionMethod",
    "proposed_total" DECIMAL(16,4),
    "confidence" DECIMAL(4,3),
    "analysis" JSONB,
    "failure_reason" TEXT,
    "quota_counted" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_quantity" DECIMAL(16,4),
    "line_quantity_after" DECIMAL(16,4),
    "merge_mode" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "photo_removed_at" TIMESTAMP(3),
    "photo_removed_by_user_id" TEXT,
    "photo_removal_reason" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_field_captures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_whatsapp_usages" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "month" CHAR(7) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "quota_reached_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_whatsapp_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_cloud_events" (
    "id" UUID NOT NULL,
    "kind" "WhatsappCloudEventKind" NOT NULL,
    "status" "WhatsappCloudEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "meta_message_id" TEXT,
    "sender_hash" CHAR(64),
    "message_type" VARCHAR(40),
    "delivery_status" VARCHAR(20),
    "payload" JSONB,
    "via" "WhatsappInboundVia" NOT NULL DEFAULT 'META',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "unknown_reply_sent_at" TIMESTAMP(3),
    "error" VARCHAR(500),

    CONSTRAINT "whatsapp_cloud_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_whatsapp_registrations_tenant_id_status_idx" ON "stock_whatsapp_registrations"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "stock_whatsapp_registrations_phone_e164_idx" ON "stock_whatsapp_registrations"("phone_e164");

-- CreateIndex
CREATE INDEX "stock_whatsapp_registration_sites_tenant_id_site_id_idx" ON "stock_whatsapp_registration_sites"("tenant_id", "site_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_whatsapp_registration_sites_registration_id_site_id_key" ON "stock_whatsapp_registration_sites"("registration_id", "site_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_whatsapp_sessions_pending_capture_id_key" ON "stock_whatsapp_sessions"("pending_capture_id");

-- CreateIndex
CREATE INDEX "stock_whatsapp_sessions_tenant_id_closed_at_idx" ON "stock_whatsapp_sessions"("tenant_id", "closed_at");

-- CreateIndex
CREATE INDEX "stock_whatsapp_sessions_closed_at_last_inbound_at_idx" ON "stock_whatsapp_sessions"("closed_at", "last_inbound_at");

-- CreateIndex
CREATE INDEX "stock_whatsapp_messages_tenant_id_registration_id_created_a_idx" ON "stock_whatsapp_messages"("tenant_id", "registration_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_whatsapp_messages_session_id_created_at_idx" ON "stock_whatsapp_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_whatsapp_messages_created_at_idx" ON "stock_whatsapp_messages"("created_at");

-- CreateIndex
CREATE INDEX "stock_field_captures_tenant_id_location_id_confirmed_at_idx" ON "stock_field_captures"("tenant_id", "location_id", "confirmed_at" DESC);

-- CreateIndex
CREATE INDEX "stock_field_captures_tenant_id_count_id_idx" ON "stock_field_captures"("tenant_id", "count_id");

-- CreateIndex
CREATE INDEX "stock_field_captures_count_line_id_idx" ON "stock_field_captures"("count_line_id");

-- CreateIndex
CREATE INDEX "stock_field_captures_tenant_id_outcome_received_at_idx" ON "stock_field_captures"("tenant_id", "outcome", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_whatsapp_usages_tenant_id_month_key" ON "stock_whatsapp_usages"("tenant_id", "month");

-- CreateIndex
CREATE INDEX "whatsapp_cloud_events_status_received_at_idx" ON "whatsapp_cloud_events"("status", "received_at");

-- CreateIndex
CREATE INDEX "whatsapp_cloud_events_sender_hash_unknown_reply_sent_at_idx" ON "whatsapp_cloud_events"("sender_hash", "unknown_reply_sent_at");

-- CreateIndex
CREATE INDEX "whatsapp_cloud_events_received_at_idx" ON "whatsapp_cloud_events"("received_at");

-- AddForeignKey
ALTER TABLE "stock_whatsapp_registrations" ADD CONSTRAINT "stock_whatsapp_registrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_registrations" ADD CONSTRAINT "stock_whatsapp_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_registrations" ADD CONSTRAINT "stock_whatsapp_registrations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_registrations" ADD CONSTRAINT "stock_whatsapp_registrations_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_registration_sites" ADD CONSTRAINT "stock_whatsapp_registration_sites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_registration_sites" ADD CONSTRAINT "stock_whatsapp_registration_sites_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "stock_whatsapp_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_registration_sites" ADD CONSTRAINT "stock_whatsapp_registration_sites_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_sessions" ADD CONSTRAINT "stock_whatsapp_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_sessions" ADD CONSTRAINT "stock_whatsapp_sessions_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "stock_whatsapp_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_sessions" ADD CONSTRAINT "stock_whatsapp_sessions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_sessions" ADD CONSTRAINT "stock_whatsapp_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_sessions" ADD CONSTRAINT "stock_whatsapp_sessions_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_sessions" ADD CONSTRAINT "stock_whatsapp_sessions_pending_capture_id_fkey" FOREIGN KEY ("pending_capture_id") REFERENCES "stock_field_captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_messages" ADD CONSTRAINT "stock_whatsapp_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_messages" ADD CONSTRAINT "stock_whatsapp_messages_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "stock_whatsapp_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_messages" ADD CONSTRAINT "stock_whatsapp_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "stock_whatsapp_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_messages" ADD CONSTRAINT "stock_whatsapp_messages_capture_id_fkey" FOREIGN KEY ("capture_id") REFERENCES "stock_field_captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_field_captures" ADD CONSTRAINT "stock_field_captures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_field_captures" ADD CONSTRAINT "stock_field_captures_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "stock_whatsapp_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_field_captures" ADD CONSTRAINT "stock_field_captures_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "stock_whatsapp_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_field_captures" ADD CONSTRAINT "stock_field_captures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_field_captures" ADD CONSTRAINT "stock_field_captures_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_field_captures" ADD CONSTRAINT "stock_field_captures_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_field_captures" ADD CONSTRAINT "stock_field_captures_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_field_captures" ADD CONSTRAINT "stock_field_captures_count_line_id_fkey" FOREIGN KEY ("count_line_id") REFERENCES "stock_count_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_field_captures" ADD CONSTRAINT "stock_field_captures_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_field_captures" ADD CONSTRAINT "stock_field_captures_photo_removed_by_user_id_fkey" FOREIGN KEY ("photo_removed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_whatsapp_usages" ADD CONSTRAINT "stock_whatsapp_usages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Contraintes ajoutees a la main (data-model §5.2)
-- ---------------------------------------------------------------------------

-- W3-R4 : un numero, une inscription non revoquee, sur toute la plateforme.
CREATE UNIQUE INDEX "stock_whatsapp_registrations_one_live_phone"
  ON "stock_whatsapp_registrations" ("phone_e164")
  WHERE "status" <> 'REVOKED';

-- W3-R4 : un membre, une inscription non revoquee dans l'agence.
CREATE UNIQUE INDEX "stock_whatsapp_registrations_one_live_member"
  ON "stock_whatsapp_registrations" ("tenant_id", "user_id")
  WHERE "status" <> 'REVOKED';

-- W3-R6 : un code en attente porte son empreinte et son echeance.
ALTER TABLE "stock_whatsapp_registrations" ADD CONSTRAINT "stock_whatsapp_registrations_pending_has_code"
  CHECK ("status" <> 'PENDING_ACTIVATION' OR ("activation_code_hash" IS NOT NULL AND "activation_expires_at" IS NOT NULL));

-- W3-R6 : le format E.164.
ALTER TABLE "stock_whatsapp_registrations" ADD CONSTRAINT "stock_whatsapp_registrations_phone_e164"
  CHECK ("phone_e164" ~ '^\+[0-9]{8,15}$');

-- W4-R1 : une session ouverte par inscription.
CREATE UNIQUE INDEX "stock_whatsapp_sessions_one_open"
  ON "stock_whatsapp_sessions" ("registration_id")
  WHERE "closed_at" IS NULL;

-- W6-R7 : un message Meta n'est traite qu'une fois.
CREATE UNIQUE INDEX "whatsapp_cloud_events_one_message"
  ON "whatsapp_cloud_events" ("meta_message_id")
  WHERE "kind" = 'MESSAGE';

-- W11-R3 : le compteur ne descend jamais sous zero.
ALTER TABLE "stock_whatsapp_usages" ADD CONSTRAINT "stock_whatsapp_usages_used_non_negative"
  CHECK ("used" >= 0);

-- W14-R5 : une photo retiree n'a plus de fichier, mais garde son empreinte.
ALTER TABLE "stock_field_captures" ADD CONSTRAINT "stock_field_captures_removed_has_no_file"
  CHECK ("photo_removed_at" IS NULL OR "file_url" IS NULL);
