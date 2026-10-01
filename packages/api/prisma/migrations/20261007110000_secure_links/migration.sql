-- Lot A3 (spec 031) : liens securises a jeton hache (lecture seule, expirants, revocables).
-- Migration additive : un type et une table, aucune donnee existante touchee.

-- CreateEnum
CREATE TYPE "SecureLinkScope" AS ENUM ('OWNER_MONTHLY_REPORT');

-- CreateTable
CREATE TABLE "secure_links" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "scope" "SecureLinkScope" NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secure_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "secure_links_token_hash_key" ON "secure_links"("token_hash");

-- CreateIndex
CREATE INDEX "secure_links_tenant_id_idx" ON "secure_links"("tenant_id");

-- CreateIndex
CREATE INDEX "secure_links_tenant_id_object_type_object_id_idx" ON "secure_links"("tenant_id", "object_type", "object_id");

-- CreateIndex
CREATE INDEX "secure_links_expires_at_idx" ON "secure_links"("expires_at");

-- AddForeignKey
ALTER TABLE "secure_links" ADD CONSTRAINT "secure_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "secure_links" ADD CONSTRAINT "secure_links_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
