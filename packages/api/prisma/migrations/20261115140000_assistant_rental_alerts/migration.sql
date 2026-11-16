CREATE TABLE "assistant_rental_alerts" (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "owner_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "rule" JSONB NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT FALSE,
    "next_check_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "assistant_rental_alerts_due_idx" ON "assistant_rental_alerts" ("next_check_at", "id");
CREATE INDEX "assistant_rental_alerts_owner_idx" ON "assistant_rental_alerts" ("tenant_id", "owner_id", "created_at" DESC, "id");
