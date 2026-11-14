CREATE UNIQUE INDEX "assistant_scheduled_reports_tenant_id_id_key" ON "assistant_scheduled_reports" ("tenant_id", "id");
CREATE TABLE "assistant_report_deliveries" (
    "tenant_id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    PRIMARY KEY ("tenant_id", "report_id", "due_at", "recipient_id"),
    CONSTRAINT "assistant_report_deliveries_report_fkey" FOREIGN KEY ("tenant_id", "report_id")
        REFERENCES "assistant_scheduled_reports" ("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
