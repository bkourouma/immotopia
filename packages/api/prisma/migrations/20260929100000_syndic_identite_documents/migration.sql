-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "document_signature_path" TEXT,
ADD COLUMN     "document_stamp_path" TEXT;

-- AlterTable
ALTER TABLE "syndicates" ADD COLUMN     "logo_path" TEXT,
ADD COLUMN     "mandating_agency_id" UUID;

-- CreateTable
CREATE TABLE "syndic_mandating_agencies" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "rccm" TEXT,
    "tax_id" TEXT,
    "logo_path" TEXT,
    "signature_path" TEXT,
    "stamp_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syndic_mandating_agencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "syndic_mandating_agencies_tenant_id_idx" ON "syndic_mandating_agencies"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "syndic_mandating_agencies_tenant_id_name_key" ON "syndic_mandating_agencies"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "syndicates_mandating_agency_id_idx" ON "syndicates"("mandating_agency_id");

-- AddForeignKey
ALTER TABLE "syndicates" ADD CONSTRAINT "syndicates_mandating_agency_id_fkey" FOREIGN KEY ("mandating_agency_id") REFERENCES "syndic_mandating_agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_mandating_agencies" ADD CONSTRAINT "syndic_mandating_agencies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

