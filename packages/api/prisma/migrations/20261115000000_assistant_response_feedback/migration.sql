CREATE TABLE "assistant_response_feedback" (
  "tenant_id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "turn_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "helpful" BOOLEAN NOT NULL,
  "comment" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assistant_response_feedback_pkey" PRIMARY KEY ("tenant_id", "owner_id", "turn_id", "revision"),
  CONSTRAINT "assistant_response_feedback_turn_fkey" FOREIGN KEY ("tenant_id", "owner_id", "turn_id")
    REFERENCES "assistant_turns" ("tenant_id", "owner_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
