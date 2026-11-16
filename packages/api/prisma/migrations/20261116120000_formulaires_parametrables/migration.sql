-- AlterTable
ALTER TABLE "syndic_payment_declarations" ALTER COLUMN "transaction_reference" DROP NOT NULL;

-- CreateTable
CREATE TABLE "tenant_form_field_settings" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "form_key" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_form_field_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_form_field_unlocks" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "form_key" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "unlocked_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_form_field_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_form_field_settings_tenant_id_form_key_idx" ON "tenant_form_field_settings"("tenant_id", "form_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_form_field_settings_tenant_id_form_key_field_key_key" ON "tenant_form_field_settings"("tenant_id", "form_key", "field_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_form_field_unlocks_tenant_id_form_key_field_key_key" ON "tenant_form_field_unlocks"("tenant_id", "form_key", "field_key");

-- AddForeignKey
ALTER TABLE "tenant_form_field_settings" ADD CONSTRAINT "tenant_form_field_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_form_field_unlocks" ADD CONSTRAINT "tenant_form_field_unlocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
