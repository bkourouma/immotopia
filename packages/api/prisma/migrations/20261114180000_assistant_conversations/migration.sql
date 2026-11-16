CREATE TABLE "assistant_conversations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "scope_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assistant_conversations_tenant_id_owner_id_id_key" UNIQUE ("tenant_id", "owner_id", "id"),
    CONSTRAINT "assistant_conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assistant_conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "assistant_conversations_history_idx"
    ON "assistant_conversations" ("tenant_id", "owner_id", "archived", "pinned", "updated_at", "id");

CREATE TABLE "assistant_turns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "response" TEXT NOT NULL DEFAULT '',
    "result" JSONB,
    "outcome" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_turns_pkey" PRIMARY KEY ("tenant_id", "owner_id", "id"),
    CONSTRAINT "assistant_turns_conversation_fkey" FOREIGN KEY ("tenant_id", "owner_id", "conversation_id")
        REFERENCES "assistant_conversations"("tenant_id", "owner_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "assistant_turns_history_idx"
    ON "assistant_turns" ("tenant_id", "owner_id", "conversation_id", "started_at", "id");
