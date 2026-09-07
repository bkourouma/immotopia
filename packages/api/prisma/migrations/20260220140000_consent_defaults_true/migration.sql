-- Consentements CRM : valeur par défaut à true (cochés par défaut)
ALTER TABLE "crm_contacts" ALTER COLUMN "consent_marketing" SET DEFAULT true;
ALTER TABLE "crm_contacts" ALTER COLUMN "consent_whatsapp" SET DEFAULT true;
ALTER TABLE "crm_contacts" ALTER COLUMN "consent_email" SET DEFAULT true;
