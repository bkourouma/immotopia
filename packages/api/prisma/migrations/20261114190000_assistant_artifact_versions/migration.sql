CREATE TABLE "assistant_artifact_versions" (
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "artifact_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL CHECK ("version" >= 2),
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_artifact_versions_pkey" PRIMARY KEY ("tenant_id", "owner_id", "conversation_id", "artifact_id", "version"),
    CONSTRAINT "assistant_artifact_versions_conversation_fkey" FOREIGN KEY ("tenant_id", "owner_id", "conversation_id")
        REFERENCES "assistant_conversations"("tenant_id", "owner_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
