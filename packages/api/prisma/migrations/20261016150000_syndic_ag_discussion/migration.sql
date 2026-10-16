-- CreateEnum
CREATE TYPE "GMChatAuthorKind" AS ENUM ('COOWNER', 'MANAGER');

-- AlterTable
ALTER TABLE "general_meetings" ADD COLUMN     "chat_closed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "gm_participants" ADD COLUMN     "chat_muted_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "gm_chat_messages" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "meeting_id" UUID NOT NULL,
    "author_kind" "GMChatAuthorKind" NOT NULL,
    "participant_id" UUID,
    "author_user_id" TEXT,
    "author_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hidden_at" TIMESTAMP(3),
    "hidden_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gm_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gm_chat_messages_tenant_id_idx" ON "gm_chat_messages"("tenant_id");

-- CreateIndex
CREATE INDEX "gm_chat_messages_meeting_id_created_at_idx" ON "gm_chat_messages"("meeting_id", "created_at");

-- AddForeignKey
ALTER TABLE "gm_chat_messages" ADD CONSTRAINT "gm_chat_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gm_chat_messages" ADD CONSTRAINT "gm_chat_messages_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "general_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gm_chat_messages" ADD CONSTRAINT "gm_chat_messages_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "gm_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

