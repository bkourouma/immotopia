-- Add constraint to ensure at least one of contact_id or deal_id is not null
-- First, delete any existing activities that have both null (orphaned activities)
DELETE FROM "crm_activities" 
WHERE "contact_id" IS NULL AND "deal_id" IS NULL;

-- Add CHECK constraint
ALTER TABLE "crm_activities" 
ADD CONSTRAINT "crm_activities_contact_or_deal_required" 
CHECK ("contact_id" IS NOT NULL OR "deal_id" IS NOT NULL);