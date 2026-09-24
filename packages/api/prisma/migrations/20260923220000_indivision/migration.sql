-- Lot 4 : indivision, quotes-parts des proprietaires d un bien. Additive uniquement.

-- CreateTable
CREATE TABLE "property_ownership_shares" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "owner_client_id" TEXT NOT NULL,
    "share_percent" DECIMAL(7,4) NOT NULL,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_ownership_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_ownership_shares_tenant_id_idx" ON "property_ownership_shares"("tenant_id");

-- CreateIndex
CREATE INDEX "property_ownership_shares_owner_client_id_idx" ON "property_ownership_shares"("owner_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_ownership_shares_property_id_owner_client_id_key" ON "property_ownership_shares"("property_id", "owner_client_id");

-- AddForeignKey
ALTER TABLE "property_ownership_shares" ADD CONSTRAINT "property_ownership_shares_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_ownership_shares" ADD CONSTRAINT "property_ownership_shares_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_ownership_shares" ADD CONSTRAINT "property_ownership_shares_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "tenant_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

