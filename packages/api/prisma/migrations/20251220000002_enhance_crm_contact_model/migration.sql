-- CreateEnum: Contact Type
CREATE TYPE "CrmContactType" AS ENUM ('PERSON', 'COMPANY');

-- CreateEnum: Civility
CREATE TYPE "Civility" AS ENUM ('MR', 'MRS', 'MS', 'DR', 'PROF');

-- CreateEnum: Identity Document Type
CREATE TYPE "IdentityDocumentType" AS ENUM ('CNI', 'PASSPORT', 'DRIVING_LICENSE', 'OTHER');

-- CreateEnum: Legal Form
CREATE TYPE "LegalForm" AS ENUM ('SARL', 'SA', 'EI', 'EURL', 'SAS', 'ASSOCIATION', 'OTHER');

-- CreateEnum: Project Type
CREATE TYPE "CrmProjectType" AS ENUM ('BUY', 'RENT', 'SELL', 'MANAGE', 'INVEST');

-- CreateEnum: Urgency Level
CREATE TYPE "CrmUrgencyLevel" AS ENUM ('IMMEDIATE', 'LESS_THAN_3_MONTHS', 'THREE_TO_SIX_MONTHS', 'MORE_THAN_6_MONTHS');

-- CreateEnum: Project Property Type
CREATE TYPE "CrmProjectPropertyType" AS ENUM ('LAND', 'APARTMENT', 'VILLA', 'OFFICE', 'SHOP', 'WAREHOUSE', 'OTHER');

-- CreateEnum: Intended Use
CREATE TYPE "IntendedUse" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'MIXED');

-- CreateEnum: Financing Mode
CREATE TYPE "FinancingMode" AS ENUM ('CASH', 'CREDIT', 'MIXED');

-- CreateEnum: Job Stability
CREATE TYPE "JobStability" AS ENUM ('CDI', 'CDD', 'FREELANCE', 'INFORMAL', 'RETIRED', 'STUDENT', 'UNEMPLOYED', 'OTHER');

-- CreateEnum: Borrowing Capacity
CREATE TYPE "BorrowingCapacity" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum: Lead Source
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'SOCIAL_MEDIA', 'REFERRAL', 'CAMPAIGN', 'AGENCY', 'WALK_IN', 'PHONE_CALL', 'OTHER');

-- CreateEnum: Maturity Level
CREATE TYPE "MaturityLevel" AS ENUM ('COLD', 'WARM', 'HOT');

-- CreateEnum: Preferred Contact Channel
CREATE TYPE "PreferredContactChannel" AS ENUM ('CALL', 'WHATSAPP', 'EMAIL', 'SMS');

-- CreateEnum: Payment Method
CREATE TYPE "PaymentMethod" AS ENUM ('MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'CHECK', 'CARD', 'OTHER');

-- CreateEnum: Priority Level
CREATE TYPE "PriorityLevel" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- AlterTable: Add new columns to crm_contacts
ALTER TABLE "crm_contacts" 
  -- Contact Type
  ADD COLUMN "contact_type" "CrmContactType" DEFAULT 'PERSON',
  
  -- Person Identification
  ADD COLUMN "civility" "Civility",
  ADD COLUMN "date_of_birth" TIMESTAMP(3),
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "identity_document_type" "IdentityDocumentType",
  ADD COLUMN "identity_document_number" TEXT,
  ADD COLUMN "identity_document_expiry" TIMESTAMP(3),
  ADD COLUMN "profile_photo_url" TEXT,
  
  -- Company Identification
  ADD COLUMN "legal_name" TEXT,
  ADD COLUMN "legal_form" "LegalForm",
  ADD COLUMN "rccm" TEXT,
  ADD COLUMN "tax_id" TEXT,
  ADD COLUMN "representative_name" TEXT,
  ADD COLUMN "representative_role" TEXT,
  
  -- Multi-Channel Contact Information
  ADD COLUMN "email_secondary" TEXT,
  ADD COLUMN "phone_primary" TEXT,
  ADD COLUMN "phone_secondary" TEXT,
  ADD COLUMN "whatsapp_number" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "preferred_language" TEXT,
  ADD COLUMN "preferred_contact_channel" "PreferredContactChannel",
  
  -- Real Estate Project Intent (JSON)
  ADD COLUMN "project_intent_json" JSONB,
  
  -- Socio-Professional Profile
  ADD COLUMN "profession" TEXT,
  ADD COLUMN "sector_of_activity" TEXT,
  ADD COLUMN "employer" TEXT,
  ADD COLUMN "income_range" TEXT,
  ADD COLUMN "job_stability" "JobStability",
  ADD COLUMN "borrowing_capacity" "BorrowingCapacity",
  
  -- CRM Behavior & Scoring
  ADD COLUMN "lead_source_enum" "LeadSource",
  ADD COLUMN "maturity_level" "MaturityLevel" DEFAULT 'COLD',
  ADD COLUMN "score" INTEGER DEFAULT 0,
  ADD COLUMN "responsiveness_rate" DECIMAL(5,2),
  ADD COLUMN "next_action_at" TIMESTAMP(3),
  ADD COLUMN "priority_level" "PriorityLevel" DEFAULT 'NORMAL',
  
  -- Financial Snapshot
  ADD COLUMN "balance" DECIMAL(12,2),
  ADD COLUMN "total_paid" DECIMAL(12,2),
  ADD COLUMN "total_due" DECIMAL(12,2),
  ADD COLUMN "deposit_amount" DECIMAL(12,2),
  ADD COLUMN "payment_incidents_count" INTEGER DEFAULT 0,
  ADD COLUMN "preferred_payment_method" "PaymentMethod",
  
  -- Consents & Compliance
  ADD COLUMN "consent_marketing" BOOLEAN DEFAULT false,
  ADD COLUMN "consent_whatsapp" BOOLEAN DEFAULT false,
  ADD COLUMN "consent_email" BOOLEAN DEFAULT false,
  ADD COLUMN "consent_date" TIMESTAMP(3),
  ADD COLUMN "consent_source" TEXT,
  
  -- Internal Notes
  ADD COLUMN "internal_notes" TEXT;

-- Migrate existing phone to phone_primary
UPDATE "crm_contacts" SET "phone_primary" = "phone" WHERE "phone" IS NOT NULL;

-- CreateIndex: Contact Type
CREATE INDEX "crm_contacts_tenant_id_contact_type_idx" ON "crm_contacts"("tenant_id", "contact_type");

-- CreateIndex: Maturity Level
CREATE INDEX "crm_contacts_tenant_id_maturity_level_idx" ON "crm_contacts"("tenant_id", "maturity_level");

-- CreateIndex: Score
CREATE INDEX "crm_contacts_tenant_id_score_idx" ON "crm_contacts"("tenant_id", "score");

-- CreateIndex: Next Action At
CREATE INDEX "crm_contacts_next_action_at_idx" ON "crm_contacts"("next_action_at");

-- CreateIndex: Phone
CREATE INDEX "crm_contacts_phone_idx" ON "crm_contacts"("phone_primary");

-- CreateIndex: WhatsApp Number
CREATE INDEX "crm_contacts_whatsapp_number_idx" ON "crm_contacts"("whatsapp_number");

-- CreateIndex: Identity Document Number
CREATE INDEX "crm_contacts_identity_document_number_idx" ON "crm_contacts"("identity_document_number");

