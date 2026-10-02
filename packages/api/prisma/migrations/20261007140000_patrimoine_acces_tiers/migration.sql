-- Lot B3 (spec 034) : acces en lecture seule des tiers de confiance (notaire, expert-comptable, banquier).
-- Migration additive : deux types et quatre tables, aucune donnee existante touchee.

-- CreateEnum
CREATE TYPE "ExternalAccessType" AS ENUM ('NOTARY', 'ACCOUNTANT', 'BANKER');

-- CreateEnum
CREATE TYPE "ExternalAccessSection" AS ENUM ('VALUATIONS', 'YIELD_RATIOS', 'LOANS', 'EXPENSES', 'RENTS', 'DOCUMENTS', 'TITLES_OWNERSHIP');

-- CreateTable
CREATE TABLE "external_access_grants" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "ExternalAccessType" NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_email" TEXT NOT NULL,
    "owner_client_id" TEXT,
    "sections" "ExternalAccessSection"[],
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMP(3),
    "last_link_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_access_grant_properties" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_access_grant_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_access_grant_entities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_access_grant_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_access_grant_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "grant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_access_grant_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_access_grants_tenant_id_idx" ON "external_access_grants"("tenant_id");

-- CreateIndex
CREATE INDEX "external_access_grants_tenant_id_revoked_at_idx" ON "external_access_grants"("tenant_id", "revoked_at");

-- CreateIndex
CREATE INDEX "external_access_grant_properties_tenant_id_idx" ON "external_access_grant_properties"("tenant_id");

-- CreateIndex
CREATE INDEX "external_access_grant_properties_grant_id_idx" ON "external_access_grant_properties"("grant_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_access_grant_properties_grant_id_property_id_key" ON "external_access_grant_properties"("grant_id", "property_id");

-- CreateIndex
CREATE INDEX "external_access_grant_entities_tenant_id_idx" ON "external_access_grant_entities"("tenant_id");

-- CreateIndex
CREATE INDEX "external_access_grant_entities_grant_id_idx" ON "external_access_grant_entities"("grant_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_access_grant_entities_grant_id_entity_id_key" ON "external_access_grant_entities"("grant_id", "entity_id");

-- CreateIndex
CREATE INDEX "external_access_grant_documents_tenant_id_idx" ON "external_access_grant_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "external_access_grant_documents_grant_id_idx" ON "external_access_grant_documents"("grant_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_access_grant_documents_grant_id_document_id_key" ON "external_access_grant_documents"("grant_id", "document_id");

-- AddForeignKey
ALTER TABLE "external_access_grants" ADD CONSTRAINT "external_access_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_access_grants" ADD CONSTRAINT "external_access_grants_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "tenant_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_access_grants" ADD CONSTRAINT "external_access_grants_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_access_grant_properties" ADD CONSTRAINT "external_access_grant_properties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_access_grant_properties" ADD CONSTRAINT "external_access_grant_properties_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "external_access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_access_grant_properties" ADD CONSTRAINT "external_access_grant_properties_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_access_grant_entities" ADD CONSTRAINT "external_access_grant_entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_access_grant_entities" ADD CONSTRAINT "external_access_grant_entities_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "external_access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_access_grant_entities" ADD CONSTRAINT "external_access_grant_entities_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "holding_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_access_grant_documents" ADD CONSTRAINT "external_access_grant_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_access_grant_documents" ADD CONSTRAINT "external_access_grant_documents_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "external_access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_access_grant_documents" ADD CONSTRAINT "external_access_grant_documents_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_access_grant_documents" ADD CONSTRAINT "external_access_grant_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "property_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
