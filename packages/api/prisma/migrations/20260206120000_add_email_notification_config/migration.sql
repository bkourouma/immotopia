-- CreateTable
CREATE TABLE "email_notification_configs" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "notification_key" VARCHAR(255) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "subject_override" VARCHAR(500),
    "body_html_override" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_notification_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_notification_configs_tenant_id_notification_key_key" ON "email_notification_configs"("tenant_id", "notification_key");

-- CreateIndex
CREATE INDEX "email_notification_configs_tenant_id_idx" ON "email_notification_configs"("tenant_id");

-- AddForeignKey
ALTER TABLE "email_notification_configs" ADD CONSTRAINT "email_notification_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
