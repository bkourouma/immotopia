-- AlterTable: Replace income_range (TEXT) with income_min and income_max (DECIMAL)
ALTER TABLE "crm_contacts" 
  ADD COLUMN "income_min" DECIMAL(12,2),
  ADD COLUMN "income_max" DECIMAL(12,2);

-- Migrate existing data: Try to parse income_range string to extract min/max values
-- This handles formats like "500000 - 1000000", "500 000 - 1 000 000", "500000-1000000", etc.
UPDATE "crm_contacts"
SET 
  "income_min" = CASE 
    WHEN "income_range" IS NOT NULL AND "income_range" ~ '^[0-9\s]+' THEN
      CAST(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART("income_range", '-', 1), ' ', 1), '[^0-9]', '', 'g') AS DECIMAL(12,2))
    ELSE NULL
  END,
  "income_max" = CASE 
    WHEN "income_range" IS NOT NULL AND "income_range" ~ '.*-.*[0-9]' THEN
      CAST(REGEXP_REPLACE(SPLIT_PART(SPLIT_PART("income_range", '-', 2), ' ', 1), '[^0-9]', '', 'g') AS DECIMAL(12,2))
    ELSE NULL
  END
WHERE "income_range" IS NOT NULL;

-- Drop the old income_range column
ALTER TABLE "crm_contacts" DROP COLUMN "income_range";

