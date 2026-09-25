-- CreateEnum
CREATE TYPE "SmsMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "tenant_sms_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sender_name" TEXT,
    "monthly_quota" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_sms_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sender_name" TEXT,
    "status" "SmsMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "notification_key" TEXT,
    "error_message" TEXT,
    "created_by_user_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_sms_settings_tenant_id_key" ON "tenant_sms_settings"("tenant_id");

-- CreateIndex
CREATE INDEX "sms_messages_tenant_id_created_at_idx" ON "sms_messages"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "sms_messages_provider_message_id_idx" ON "sms_messages"("provider_message_id");

-- AddForeignKey
ALTER TABLE "tenant_sms_settings" ADD CONSTRAINT "tenant_sms_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

