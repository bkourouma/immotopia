ALTER TABLE "assistant_scheduled_reports"
    ALTER COLUMN "schedule" DROP NOT NULL,
    ADD COLUMN "immediate_key" TEXT,
    ADD COLUMN "message" TEXT,
    ADD CONSTRAINT "assistant_reports_delivery_kind" CHECK (
        ("schedule" IS NOT NULL AND "immediate_key" IS NULL AND "message" IS NULL)
        OR ("schedule" IS NULL AND "immediate_key" IS NOT NULL)
    );
CREATE UNIQUE INDEX "assistant_reports_immediate_key"
    ON "assistant_scheduled_reports" ("tenant_id", "owner_id", "immediate_key");
