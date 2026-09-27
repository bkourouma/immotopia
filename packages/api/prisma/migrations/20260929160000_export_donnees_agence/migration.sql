-- CreateEnum
CREATE TYPE "TenantDataExportStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "tenant_data_exports" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" "TenantDataExportStatus" NOT NULL DEFAULT 'QUEUED',
    "requested_by_id" TEXT NOT NULL,
    "file_path" TEXT,
    "size_bytes" BIGINT,
    "model_count" INTEGER,
    "row_count" INTEGER,
    "file_count" INTEGER,
    "missing_file_count" INTEGER,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_data_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_data_exports_tenant_id_created_at_idx" ON "tenant_data_exports"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "tenant_data_exports_status_idx" ON "tenant_data_exports"("status");

