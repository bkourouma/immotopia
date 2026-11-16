CREATE TABLE "assistant_scheduled_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "schedule" JSONB NOT NULL,
    "recipient_ids" TEXT[] NOT NULL,
    "formats" TEXT[] NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "next_run_at" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "last_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_scheduled_reports_analysis_fkey" FOREIGN KEY ("tenant_id", "owner_id", "conversation_id", "artifact_id")
        REFERENCES "assistant_saved_analyses" ("tenant_id", "owner_id", "conversation_id", "artifact_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "assistant_scheduled_reports_list_idx"
    ON "assistant_scheduled_reports" ("tenant_id", "owner_id", "created_at" DESC, "id");
CREATE INDEX "assistant_scheduled_reports_due_idx"
    ON "assistant_scheduled_reports" ("active", "next_run_at");
