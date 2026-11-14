CREATE TABLE "assistant_tasks" (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "creator_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "assignee_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "request_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL CHECK ("priority" IN ('low', 'normal', 'high')),
    "due_date" DATE,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversation_id" TEXT,
    "artifact_id" TEXT,
    "share_id" TEXT,
    CONSTRAINT "assistant_tasks_analysis_pair" CHECK (
        ("conversation_id" IS NULL) = ("artifact_id" IS NULL)
        AND ("share_id" IS NULL OR ("creator_id" <> "assignee_id" AND "artifact_id" IS NOT NULL))
    )
);
CREATE UNIQUE INDEX "assistant_tasks_request_key" ON "assistant_tasks" ("tenant_id", "creator_id", "request_id");
CREATE INDEX "assistant_tasks_created_idx" ON "assistant_tasks" ("tenant_id", "creator_id", "created_at" DESC, "id");
CREATE INDEX "assistant_tasks_assigned_idx" ON "assistant_tasks" ("tenant_id", "assignee_id", "created_at" DESC, "id");
