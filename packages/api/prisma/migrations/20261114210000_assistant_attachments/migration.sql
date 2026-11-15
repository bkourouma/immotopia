CREATE TABLE "assistant_attachments" (
  "tenant_id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "turn_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL CHECK ("position" BETWEEN 0 AND 4),
  "name" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "artifact_id" TEXT,
  "bytes" BYTEA NOT NULL CHECK (octet_length("bytes") BETWEEN 1 AND 10485760),
  CONSTRAINT "assistant_attachments_pkey" PRIMARY KEY ("tenant_id", "owner_id", "turn_id", "position"),
  CONSTRAINT "assistant_attachments_tenant_id_owner_id_turn_id_fkey"
    FOREIGN KEY ("tenant_id", "owner_id", "turn_id")
    REFERENCES "assistant_turns" ("tenant_id", "owner_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
