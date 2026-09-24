-- Lot 5 : vie du bail (revisions, renouvellements, avenants, resiliation) et etats des lieux. Additive uniquement.

-- CreateEnum
CREATE TYPE "LeaseEventType" AS ENUM ('REVISION', 'RENEWAL', 'AMENDMENT', 'TERMINATION');

-- CreateEnum
CREATE TYPE "LeaseTerminationInitiator" AS ENUM ('TENANT', 'LANDLORD', 'MUTUAL');

-- CreateEnum
CREATE TYPE "LeaseInspectionType" AS ENUM ('ENTRY', 'EXIT');

-- CreateEnum
CREATE TYPE "LeaseInspectionStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateTable
CREATE TABLE "lease_events" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" UUID NOT NULL,
    "type" "LeaseEventType" NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "previous_rent" DECIMAL(12,2),
    "new_rent" DECIMAL(12,2),
    "previous_charges" DECIMAL(12,2),
    "new_charges" DECIMAL(12,2),
    "revision_rate" DECIMAL(6,3),
    "previous_end_date" TIMESTAMP(3),
    "new_end_date" TIMESTAMP(3),
    "notice_date" TIMESTAMP(3),
    "initiated_by" "LeaseTerminationInitiator",
    "move_out_date" TIMESTAMP(3),
    "summary" TEXT,
    "details" JSONB,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_inspections" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" UUID NOT NULL,
    "type" "LeaseInspectionType" NOT NULL,
    "status" "LeaseInspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "inspection_date" TIMESTAMP(3) NOT NULL,
    "rooms" JSONB NOT NULL DEFAULT '[]',
    "meters" JSONB,
    "keys_count" INTEGER,
    "general_comment" TEXT,
    "tenant_present" BOOLEAN NOT NULL DEFAULT true,
    "tenant_signatory_name" TEXT,
    "agent_signatory_name" TEXT,
    "deductions" JSONB,
    "finalized_at" TIMESTAMP(3),
    "finalized_by_user_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lease_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_inspection_photos" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "inspection_id" UUID NOT NULL,
    "room_id" TEXT,
    "item_id" TEXT,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "caption" TEXT,
    "uploaded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_inspection_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lease_events_tenant_id_idx" ON "lease_events"("tenant_id");

-- CreateIndex
CREATE INDEX "lease_events_lease_id_effective_date_idx" ON "lease_events"("lease_id", "effective_date");

-- CreateIndex
CREATE INDEX "lease_inspections_tenant_id_idx" ON "lease_inspections"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "lease_inspections_lease_id_type_key" ON "lease_inspections"("lease_id", "type");

-- CreateIndex
CREATE INDEX "lease_inspection_photos_tenant_id_idx" ON "lease_inspection_photos"("tenant_id");

-- CreateIndex
CREATE INDEX "lease_inspection_photos_inspection_id_idx" ON "lease_inspection_photos"("inspection_id");

-- AddForeignKey
ALTER TABLE "lease_events" ADD CONSTRAINT "lease_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_events" ADD CONSTRAINT "lease_events_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_inspections" ADD CONSTRAINT "lease_inspections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_inspections" ADD CONSTRAINT "lease_inspections_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_inspection_photos" ADD CONSTRAINT "lease_inspection_photos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_inspection_photos" ADD CONSTRAINT "lease_inspection_photos_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "lease_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

