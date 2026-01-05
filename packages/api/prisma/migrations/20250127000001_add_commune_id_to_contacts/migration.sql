-- AlterTable: Add commune_id column to crm_contacts
ALTER TABLE "crm_contacts" 
  ADD COLUMN "commune_id" TEXT;

-- CreateIndex: Add index on commune_id for efficient queries
CREATE INDEX "crm_contacts_commune_id_idx" ON "crm_contacts"("commune_id");

-- AddForeignKey: Add foreign key constraint
ALTER TABLE "crm_contacts" 
  ADD CONSTRAINT "crm_contacts_commune_id_fkey" 
  FOREIGN KEY ("commune_id") REFERENCES "communes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

