CREATE TABLE "assistant_provider_usage" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT,
  "provider" VARCHAR(20) NOT NULL,
  "model" VARCHAR(200),
  "mode" VARCHAR(20) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "upstream_status" INTEGER,
  "duration_ms" INTEGER NOT NULL,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "cache_read_tokens" INTEGER,
  "cache_write_tokens" INTEGER,
  "cost_usd" DECIMAL(20,12),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_provider_usage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assistant_provider_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "assistant_provider_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "assistant_provider_usage_created_at_idx" ON "assistant_provider_usage"("created_at");
CREATE INDEX "assistant_provider_usage_tenant_id_created_at_idx" ON "assistant_provider_usage"("tenant_id", "created_at");
CREATE INDEX "assistant_provider_usage_user_id_idx" ON "assistant_provider_usage"("user_id");
