-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "role_ids" TEXT[];

-- RenameIndex
ALTER INDEX "whatsapp_group_invite_logs_tenant_id_contact_id_invite_link_h_k" RENAME TO "whatsapp_group_invite_logs_tenant_id_contact_id_invite_link_key";
