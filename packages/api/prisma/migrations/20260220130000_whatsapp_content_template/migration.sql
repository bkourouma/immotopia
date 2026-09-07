-- AlterTable: add Twilio Content Template support for business-initiated WhatsApp messages
ALTER TABLE "whatsapp_notification_configs" ADD COLUMN IF NOT EXISTS "content_sid" VARCHAR(100);
ALTER TABLE "whatsapp_notification_configs" ADD COLUMN IF NOT EXISTS "content_variables_json" TEXT;
