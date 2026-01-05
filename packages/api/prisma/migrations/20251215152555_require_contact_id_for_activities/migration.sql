-- Update activities that have dealId but no contactId: set contactId from the deal
UPDATE "crm_activities" 
SET "contact_id" = (
  SELECT "contact_id" 
  FROM "crm_deals" 
  WHERE "crm_deals"."id" = "crm_activities"."deal_id"
)
WHERE "contact_id" IS NULL AND "deal_id" IS NOT NULL;

-- Delete activities that have neither contactId nor dealId (orphaned activities)
DELETE FROM "crm_activities" 
WHERE "contact_id" IS NULL AND "deal_id" IS NULL;

-- Drop the old constraint
ALTER TABLE "crm_activities" 
DROP CONSTRAINT IF EXISTS "crm_activities_contact_or_deal_required";

-- Add new constraint requiring contactId
ALTER TABLE "crm_activities" 
ADD CONSTRAINT "crm_activities_contact_id_required" 
CHECK ("contact_id" IS NOT NULL);

-- Make contact_id NOT NULL
ALTER TABLE "crm_activities" 
ALTER COLUMN "contact_id" SET NOT NULL;