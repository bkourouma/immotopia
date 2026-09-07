-- CreateTable
CREATE TABLE "whatsapp_notification_configs" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "notification_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "body_override" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_notification_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_notification_configs_tenant_id_notification_key_key" ON "whatsapp_notification_configs"("tenant_id", "notification_key");

-- CreateIndex
CREATE INDEX "whatsapp_notification_configs_tenant_id_idx" ON "whatsapp_notification_configs"("tenant_id");

-- AddForeignKey
ALTER TABLE "whatsapp_notification_configs" ADD CONSTRAINT "whatsapp_notification_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
