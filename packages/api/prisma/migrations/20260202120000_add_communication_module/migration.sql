-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('ANNOUNCEMENT', 'ALERT', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "CommunicationStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommunicationRecipientType" AS ENUM ('OWNER', 'RENTER', 'AGENCY_USER', 'CONTACT');

-- CreateEnum
CREATE TYPE "EventTrigger" AS ENUM ('LEASE_ACTIVATED', 'LEASE_ENDING_SOON', 'INSTALLMENT_DUE_REMINDER', 'INSTALLMENT_OVERDUE', 'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'TICKET_CREATED', 'TICKET_STATUS_CHANGED', 'DEAL_CREATED', 'DEAL_STAGE_CHANGED', 'APPOINTMENT_REMINDER', 'PROPERTY_PUBLISHED', 'DOCUMENT_EXPIRING', 'INVITATION', 'PASSWORD_RESET', 'CUSTOM');

-- CreateTable
CREATE TABLE "communication_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CommunicationType" NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "subject" VARCHAR(500),
    "body" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "event_trigger" "EventTrigger" NOT NULL,
    "recipient_types" "CommunicationRecipientType"[],
    "template_id_email" TEXT,
    "template_id_whatsapp" TEXT,
    "template_id_sms" TEXT,
    "copy_agency" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "CommunicationType" NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'PENDING',
    "recipient_type" "CommunicationRecipientType" NOT NULL,
    "recipient_tenant_client_id" TEXT,
    "recipient_contact_id" TEXT,
    "recipient_user_id" TEXT,
    "subject" VARCHAR(500),
    "body" TEXT NOT NULL,
    "external_id" VARCHAR(255),
    "failure_reason" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_preferences" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "recipient_type" "CommunicationRecipientType" NOT NULL,
    "recipient_tenant_client_id" TEXT,
    "recipient_contact_id" TEXT,
    "recipient_user_id" TEXT,
    "channels" "CommunicationChannel"[] DEFAULT ARRAY['EMAIL', 'WHATSAPP']::"CommunicationChannel"[],
    "types" "CommunicationType"[] DEFAULT ARRAY['ANNOUNCEMENT', 'ALERT', 'NOTIFICATION']::"CommunicationType"[],
    "disabled_triggers" "EventTrigger"[] DEFAULT ARRAY[]::"EventTrigger"[],
    "quiet_hours_start" VARCHAR(5),
    "quiet_hours_end" VARCHAR(5),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "communication_templates_tenant_id_name_channel_key" ON "communication_templates"("tenant_id", "name", "channel");

-- CreateIndex
CREATE INDEX "communication_templates_tenant_id_idx" ON "communication_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "communication_templates_tenant_id_type_idx" ON "communication_templates"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "communication_templates_tenant_id_channel_idx" ON "communication_templates"("tenant_id", "channel");

-- CreateIndex
CREATE INDEX "notification_rules_tenant_id_idx" ON "notification_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "notification_rules_tenant_id_event_trigger_idx" ON "notification_rules"("tenant_id", "event_trigger");

-- CreateIndex
CREATE INDEX "notification_rules_tenant_id_active_idx" ON "notification_rules"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "communications_tenant_id_idx" ON "communications"("tenant_id");

-- CreateIndex
CREATE INDEX "communications_tenant_id_status_idx" ON "communications"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "communications_tenant_id_type_idx" ON "communications"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "communications_tenant_id_channel_idx" ON "communications"("tenant_id", "channel");

-- CreateIndex
CREATE INDEX "communications_tenant_id_created_at_idx" ON "communications"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "communications_recipient_tenant_client_id_idx" ON "communications"("recipient_tenant_client_id");

-- CreateIndex
CREATE INDEX "communications_recipient_contact_id_idx" ON "communications"("recipient_contact_id");

-- CreateIndex
CREATE INDEX "communications_scheduled_at_idx" ON "communications"("scheduled_at");

-- CreateIndex
CREATE INDEX "communication_preferences_tenant_id_idx" ON "communication_preferences"("tenant_id");

-- CreateIndex
CREATE INDEX "communication_preferences_recipient_tenant_client_id_idx" ON "communication_preferences"("recipient_tenant_client_id");

-- CreateIndex
CREATE INDEX "communication_preferences_recipient_contact_id_idx" ON "communication_preferences"("recipient_contact_id");

-- CreateIndex
CREATE INDEX "communication_preferences_recipient_user_id_idx" ON "communication_preferences"("recipient_user_id");

-- AddForeignKey
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_template_id_email_fkey" FOREIGN KEY ("template_id_email") REFERENCES "communication_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_template_id_whatsapp_fkey" FOREIGN KEY ("template_id_whatsapp") REFERENCES "communication_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_rules" ADD CONSTRAINT "notification_rules_template_id_sms_fkey" FOREIGN KEY ("template_id_sms") REFERENCES "communication_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_recipient_tenant_client_id_fkey" FOREIGN KEY ("recipient_tenant_client_id") REFERENCES "tenant_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_recipient_contact_id_fkey" FOREIGN KEY ("recipient_contact_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_recipient_tenant_client_id_fkey" FOREIGN KEY ("recipient_tenant_client_id") REFERENCES "tenant_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_recipient_contact_id_fkey" FOREIGN KEY ("recipient_contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
