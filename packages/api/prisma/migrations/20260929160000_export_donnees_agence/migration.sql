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


-- Une seule demande en cours (QUEUED ou RUNNING) par agence, garantie par la
-- base meme avec plusieurs instances de l'API. Index partiel : Prisma ne sait
-- pas le declarer dans le schema, il vit seulement ici. Une violation (P2002)
-- est traduite en 409 par le service.
CREATE UNIQUE INDEX "tenant_data_exports_one_active_per_tenant"
    ON "tenant_data_exports"("tenant_id")
    WHERE "status" IN ('QUEUED', 'RUNNING');
