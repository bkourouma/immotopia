-- CreateTable: Add crm_contact_target_zones table for many-to-many relationship
CREATE TABLE "crm_contact_target_zones" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "commune_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_contact_target_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Add unique constraint on contact_id and commune_id
CREATE UNIQUE INDEX "crm_contact_target_zones_contact_id_commune_id_key" ON "crm_contact_target_zones"("contact_id", "commune_id");

-- CreateIndex: Add index on contact_id
CREATE INDEX "crm_contact_target_zones_contact_id_idx" ON "crm_contact_target_zones"("contact_id");

-- CreateIndex: Add index on commune_id
CREATE INDEX "crm_contact_target_zones_commune_id_idx" ON "crm_contact_target_zones"("commune_id");

-- AddForeignKey: Add foreign key constraint for contact_id
ALTER TABLE "crm_contact_target_zones" ADD CONSTRAINT "crm_contact_target_zones_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Add foreign key constraint for commune_id
ALTER TABLE "crm_contact_target_zones" ADD CONSTRAINT "crm_contact_target_zones_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "communes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

