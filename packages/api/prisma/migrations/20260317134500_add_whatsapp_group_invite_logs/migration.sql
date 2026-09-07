-- Create table for WhatsApp group invite deduplication and delivery history
CREATE TABLE "whatsapp_group_invite_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "invite_link" TEXT NOT NULL,
    "invite_link_hash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "first_sent_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_group_invite_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_group_invite_logs_tenant_id_contact_id_invite_link_h_key"
ON "whatsapp_group_invite_logs"("tenant_id", "contact_id", "invite_link_hash");

CREATE INDEX "whatsapp_group_invite_logs_tenant_id_idx" ON "whatsapp_group_invite_logs"("tenant_id");
CREATE INDEX "whatsapp_group_invite_logs_contact_id_idx" ON "whatsapp_group_invite_logs"("contact_id");
CREATE INDEX "whatsapp_group_invite_logs_tenant_id_status_idx"
ON "whatsapp_group_invite_logs"("tenant_id", "status");

ALTER TABLE "whatsapp_group_invite_logs"
ADD CONSTRAINT "whatsapp_group_invite_logs_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_group_invite_logs"
ADD CONSTRAINT "whatsapp_group_invite_logs_contact_id_fkey"
FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
