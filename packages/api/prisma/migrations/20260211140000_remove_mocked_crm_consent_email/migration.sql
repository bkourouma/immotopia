-- Remove mocked CRM contacts from newsletter lists
-- Sets consent_email = false for all CRM contacts (no seed should create contacts with newsletter consent)
-- Run this to clear any mock/test data that showed 3 contacts when selecting FROM_CRM_CONTACTS list

UPDATE "crm_contacts"
SET "consent_email" = false
WHERE "consent_email" = true;
