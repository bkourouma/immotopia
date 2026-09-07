-- Newsletter / Mailing module
-- Add newsletter_consent to tenant_clients, create newsletter tables and enums

-- Add newsletter_consent to tenant_clients if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenant_clients' AND column_name = 'newsletter_consent'
  ) THEN
    ALTER TABLE "tenant_clients" ADD COLUMN "newsletter_consent" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "NewsletterListType" AS ENUM ('MANUAL', 'FROM_OWNERS', 'FROM_RENTERS', 'FROM_CRM_CONTACTS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NewsletterSubscriberStatus" AS ENUM ('PENDING_CONFIRMATION', 'ACTIVE', 'UNSUBSCRIBED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NewsletterCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "NewsletterCampaignRecipientStatus" AS ENUM ('SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "newsletter_lists" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "NewsletterListType" NOT NULL,
    "double_opt_in" BOOLEAN NOT NULL DEFAULT true,
    "public_subscribe_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" "NewsletterSubscriberStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "confirmation_token" TEXT,
    "confirmation_token_expires_at" TIMESTAMP(3),
    "subscribed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "unsubscribed_at" TIMESTAMP(3),
    "source_entity_type" TEXT,
    "source_entity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "newsletter_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "newsletter_campaigns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "template_id" TEXT,
    "subject" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "rendered_html" TEXT,
    "status" "NewsletterCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "newsletter_campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subscriber_id" TEXT,
    "email" TEXT NOT NULL,
    "status" "NewsletterCampaignRecipientStatus" NOT NULL,
    "sent_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "unsubscribe_token" TEXT,

    CONSTRAINT "newsletter_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_lists_public_subscribe_token_key" ON "newsletter_lists"("public_subscribe_token");

CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_lists_tenant_id_name_key" ON "newsletter_lists"("tenant_id", "name");

CREATE INDEX IF NOT EXISTS "newsletter_lists_tenant_id_idx" ON "newsletter_lists"("tenant_id");

CREATE INDEX IF NOT EXISTS "newsletter_lists_tenant_id_type_idx" ON "newsletter_lists"("tenant_id", "type");

CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_subscribers_confirmation_token_key" ON "newsletter_subscribers"("confirmation_token");

CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_subscribers_list_id_email_key" ON "newsletter_subscribers"("list_id", "email");

CREATE INDEX IF NOT EXISTS "newsletter_subscribers_tenant_id_idx" ON "newsletter_subscribers"("tenant_id");

CREATE INDEX IF NOT EXISTS "newsletter_subscribers_list_id_idx" ON "newsletter_subscribers"("list_id");

CREATE INDEX IF NOT EXISTS "newsletter_subscribers_list_id_status_idx" ON "newsletter_subscribers"("list_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_templates_tenant_id_name_key" ON "newsletter_templates"("tenant_id", "name");

CREATE INDEX IF NOT EXISTS "newsletter_templates_tenant_id_idx" ON "newsletter_templates"("tenant_id");

CREATE INDEX IF NOT EXISTS "newsletter_campaigns_tenant_id_idx" ON "newsletter_campaigns"("tenant_id");

CREATE INDEX IF NOT EXISTS "newsletter_campaigns_list_id_idx" ON "newsletter_campaigns"("list_id");

CREATE INDEX IF NOT EXISTS "newsletter_campaigns_status_idx" ON "newsletter_campaigns"("status");

CREATE INDEX IF NOT EXISTS "newsletter_campaigns_scheduled_at_idx" ON "newsletter_campaigns"("scheduled_at");

CREATE INDEX IF NOT EXISTS "newsletter_campaigns_sent_at_idx" ON "newsletter_campaigns"("sent_at");

CREATE INDEX IF NOT EXISTS "newsletter_campaign_recipients_campaign_id_idx" ON "newsletter_campaign_recipients"("campaign_id");

CREATE INDEX IF NOT EXISTS "newsletter_campaign_recipients_tenant_id_idx" ON "newsletter_campaign_recipients"("tenant_id");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "newsletter_lists" ADD CONSTRAINT "newsletter_lists_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "newsletter_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "newsletter_templates" ADD CONSTRAINT "newsletter_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "newsletter_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "newsletter_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "newsletter_campaign_recipients" ADD CONSTRAINT "newsletter_campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "newsletter_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "newsletter_campaign_recipients" ADD CONSTRAINT "newsletter_campaign_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "newsletter_campaign_recipients" ADD CONSTRAINT "newsletter_campaign_recipients_subscriber_id_fkey" FOREIGN KEY ("subscriber_id") REFERENCES "newsletter_subscribers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
