-- CreateEnum
CREATE TYPE "GMRecordingStatus" AS ENUM ('RECORDING', 'PROCESSING', 'AVAILABLE', 'FAILED', 'DELETED');

-- CreateTable
CREATE TABLE "gm_recordings" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "meeting_id" UUID NOT NULL,
    "egress_id" TEXT NOT NULL,
    "status" "GMRecordingStatus" NOT NULL DEFAULT 'RECORDING',
    "storage_key" TEXT NOT NULL,
    "file_url" TEXT,
    "file_size" BIGINT,
    "duration_seconds" INTEGER,
    "failure_reason" TEXT,
    "webhook_event_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_by_user_id" TEXT,
    "stopped_at" TIMESTAMP(3),
    "stopped_by_user_id" TEXT,
    "ended_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "deleted_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gm_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gm_recordings_egress_id_key" ON "gm_recordings"("egress_id");

-- CreateIndex
CREATE UNIQUE INDEX "gm_recordings_webhook_event_id_key" ON "gm_recordings"("webhook_event_id");

-- CreateIndex
CREATE INDEX "gm_recordings_tenant_id_idx" ON "gm_recordings"("tenant_id");

-- CreateIndex
CREATE INDEX "gm_recordings_meeting_id_idx" ON "gm_recordings"("meeting_id");

-- AddForeignKey
ALTER TABLE "gm_recordings" ADD CONSTRAINT "gm_recordings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gm_recordings" ADD CONSTRAINT "gm_recordings_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "general_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

