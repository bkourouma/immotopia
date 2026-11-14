ALTER TABLE "assistant_analysis_shares"
    ALTER COLUMN "artifact_id" DROP NOT NULL,
    ADD CONSTRAINT "assistant_analysis_shares_conversation_fkey"
        FOREIGN KEY ("tenant_id", "owner_id", "conversation_id")
        REFERENCES "assistant_conversations" ("tenant_id", "owner_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "assistant_conversation_shares_recipient_key"
    ON "assistant_analysis_shares" ("tenant_id", "owner_id", "conversation_id", "recipient_id")
    WHERE "artifact_id" IS NULL;
