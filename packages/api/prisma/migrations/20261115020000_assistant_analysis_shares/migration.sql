CREATE TABLE "assistant_analysis_shares" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_analysis_shares_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assistant_analysis_shares_analysis_fkey" FOREIGN KEY ("tenant_id", "owner_id", "conversation_id", "artifact_id")
        REFERENCES "assistant_saved_analyses" ("tenant_id", "owner_id", "conversation_id", "artifact_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assistant_analysis_shares_recipient_fkey" FOREIGN KEY ("recipient_id")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "assistant_analysis_shares_recipient_key"
    ON "assistant_analysis_shares" ("tenant_id", "owner_id", "conversation_id", "artifact_id", "recipient_id");
CREATE INDEX "assistant_analysis_shares_inbox_idx"
    ON "assistant_analysis_shares" ("tenant_id", "recipient_id", "created_at" DESC, "id");
