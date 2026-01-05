-- AlterTable: Add location_zone column to crm_contacts
ALTER TABLE "crm_contacts" 
  ADD COLUMN "location_zone" TEXT;

-- CreateIndex: Add index on location_zone for efficient matching queries
CREATE INDEX "crm_contacts_location_zone_idx" ON "crm_contacts"("location_zone");

