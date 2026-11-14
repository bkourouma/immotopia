CREATE TABLE "assistant_follow_ups" (
    "id" TEXT PRIMARY KEY,
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "turn_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'CONFIRMED', 'DECLINED', 'FAILED')),
    "payload" JSONB NOT NULL,
    "display" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_follow_ups_turn_fkey" FOREIGN KEY ("tenant_id", "owner_id", "turn_id")
      REFERENCES "assistant_turns" ("tenant_id", "owner_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "assistant_follow_ups_turn_idx" ON "assistant_follow_ups" ("tenant_id", "owner_id", "turn_id");
