-- CreateEnum
CREATE TYPE "InAppNotificationStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InAppNotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SENT', 'DELIVERED', 'READ');

-- CreateTable
CREATE TABLE "in_app_notifications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "recipient_type" "CommunicationRecipientType" NOT NULL,
    "recipient_user_id" TEXT,
    "recipient_tenant_client_id" TEXT,
    "recipient_contact_id" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "CommunicationType" NOT NULL,
    "event_trigger" "EventTrigger",
    "priority" "InAppNotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "InAppNotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "read_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "action_url" TEXT,
    "communication_id" TEXT,
    "metadata" JSONB,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "ConversationType" NOT NULL DEFAULT 'DIRECT',
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT,
    "description" TEXT,
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" VARCHAR(500),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "participant_type" "CommunicationRecipientType" NOT NULL,
    "participant_user_id" TEXT,
    "participant_tenant_client_id" TEXT,
    "participant_contact_id" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_at" TIMESTAMP(3),
    "last_read_message_id" TEXT,
    "muted_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "left_at" TIMESTAMP(3),

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sender_type" "CommunicationRecipientType" NOT NULL,
    "sender_user_id" TEXT,
    "sender_tenant_client_id" TEXT,
    "sender_contact_id" TEXT,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "is_system_message" BOOLEAN NOT NULL DEFAULT false,
    "status" "MessageStatus" NOT NULL DEFAULT 'SENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_read_receipts" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "reader_type" "CommunicationRecipientType" NOT NULL,
    "reader_user_id" TEXT,
    "reader_tenant_client_id" TEXT,
    "reader_contact_id" TEXT,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_read_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "in_app_notifications_tenant_id_recipient_user_id_status_idx" ON "in_app_notifications"("tenant_id", "recipient_user_id", "status");

-- CreateIndex
CREATE INDEX "in_app_notifications_tenant_id_recipient_tenant_client_id_sta_idx" ON "in_app_notifications"("tenant_id", "recipient_tenant_client_id", "status");

-- CreateIndex
CREATE INDEX "in_app_notifications_tenant_id_recipient_contact_id_status_idx" ON "in_app_notifications"("tenant_id", "recipient_contact_id", "status");

-- CreateIndex
CREATE INDEX "in_app_notifications_created_at_idx" ON "in_app_notifications"("created_at");

-- CreateIndex
CREATE INDEX "in_app_notifications_status_expires_at_idx" ON "in_app_notifications"("status", "expires_at");

-- CreateIndex
CREATE INDEX "conversations_tenant_id_status_idx" ON "conversations"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "conversations_last_message_at_idx" ON "conversations"("last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_participant_user_id_key" ON "conversation_participants"("conversation_id", "participant_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_participant_tenant__key" ON "conversation_participants"("conversation_id", "participant_tenant_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_participant_contact_key" ON "conversation_participants"("conversation_id", "participant_contact_id");

-- CreateIndex
CREATE INDEX "conversation_participants_tenant_id_participant_user_id_idx" ON "conversation_participants"("tenant_id", "participant_user_id");

-- CreateIndex
CREATE INDEX "conversation_participants_tenant_id_participant_tenant_clien_idx" ON "conversation_participants"("tenant_id", "participant_tenant_client_id");

-- CreateIndex
CREATE INDEX "conversation_participants_tenant_id_participant_contact_id_idx" ON "conversation_participants"("tenant_id", "participant_contact_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_tenant_id_idx" ON "messages"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_read_receipts_message_id_reader_user_id_key" ON "message_read_receipts"("message_id", "reader_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_read_receipts_message_id_reader_tenant_client_id_key" ON "message_read_receipts"("message_id", "reader_tenant_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_read_receipts_message_id_reader_contact_id_key" ON "message_read_receipts"("message_id", "reader_contact_id");

-- CreateIndex
CREATE INDEX "message_read_receipts_tenant_id_idx" ON "message_read_receipts"("tenant_id");

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_recipient_tenant_client_id_fkey" FOREIGN KEY ("recipient_tenant_client_id") REFERENCES "tenant_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_recipient_contact_id_fkey" FOREIGN KEY ("recipient_contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "communications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_participant_user_id_fkey" FOREIGN KEY ("participant_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_participant_tenant_client_id_fkey" FOREIGN KEY ("participant_tenant_client_id") REFERENCES "tenant_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_participant_contact_id_fkey" FOREIGN KEY ("participant_contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_tenant_client_id_fkey" FOREIGN KEY ("sender_tenant_client_id") REFERENCES "tenant_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_contact_id_fkey" FOREIGN KEY ("sender_contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_reader_user_id_fkey" FOREIGN KEY ("reader_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_reader_tenant_client_id_fkey" FOREIGN KEY ("reader_tenant_client_id") REFERENCES "tenant_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_reader_contact_id_fkey" FOREIGN KEY ("reader_contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
