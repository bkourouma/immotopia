CREATE TABLE "assistant_saved_analyses" (
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "original" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_saved_analyses_pkey" PRIMARY KEY ("tenant_id", "owner_id", "conversation_id", "artifact_id"),
    CONSTRAINT "assistant_saved_analyses_conversation_fkey" FOREIGN KEY ("tenant_id", "owner_id", "conversation_id")
        REFERENCES "assistant_conversations" ("tenant_id", "owner_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "assistant_saved_analyses_list_idx"
    ON "assistant_saved_analyses" ("tenant_id", "owner_id", "created_at" DESC, "conversation_id", "artifact_id");
