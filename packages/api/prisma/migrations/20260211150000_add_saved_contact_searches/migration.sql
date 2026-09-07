-- CreateEnum
CREATE TYPE "SavedSearchScope" AS ENUM ('PERSONAL', 'TEAM', 'TENANT');

-- CreateTable
CREATE TABLE "saved_contact_searches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL,
    "scope" "SavedSearchScope" NOT NULL DEFAULT 'PERSONAL',
    "created_by_id" TEXT NOT NULL,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_contact_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_contact_searches_tenant_id_scope_idx" ON "saved_contact_searches"("tenant_id", "scope");

-- CreateIndex
CREATE INDEX "saved_contact_searches_created_by_id_idx" ON "saved_contact_searches"("created_by_id");

-- AddForeignKey
ALTER TABLE "saved_contact_searches" ADD CONSTRAINT "saved_contact_searches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_contact_searches" ADD CONSTRAINT "saved_contact_searches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
