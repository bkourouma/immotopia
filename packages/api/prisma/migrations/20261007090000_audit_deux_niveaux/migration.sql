-- Journal d'audit a deux niveaux (ADR-006, specs/023-audit-deux-niveaux).
--
-- Migration ADDITIVE : toutes les colonnes ont une valeur par defaut, donc les
-- appelants existants de `logAuditEvent` continuent de fonctionner sans
-- changement. Ordre voulu :
--   1. colonnes et enumerations ;
--   2. rattrapage des lignes existantes (AVANT le declencheur, qui interdit
--      tout UPDATE) ;
--   3. contrainte d'invariant, index ;
--   4. declencheur d'immuabilite.

-- 1. Enumerations et colonnes ------------------------------------------------

CREATE TYPE "AuditScope" AS ENUM ('TENANT', 'PLATFORM');
CREATE TYPE "AuditVisibility" AS ENUM ('TENANT', 'PLATFORM_ONLY');
CREATE TYPE "AuditCategory" AS ENUM ('AUTH', 'DATA', 'ADMIN', 'SECURITY', 'BILLING', 'EXPORT', 'AI', 'SYSTEM');
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SUPER_ADMIN', 'PORTAL', 'SYSTEM', 'AI');

ALTER TABLE "audit_logs"
  ADD COLUMN "scope" "AuditScope" NOT NULL DEFAULT 'PLATFORM',
  ADD COLUMN "visibility" "AuditVisibility" NOT NULL DEFAULT 'PLATFORM_ONLY',
  ADD COLUMN "category" "AuditCategory" NOT NULL DEFAULT 'DATA',
  ADD COLUMN "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "actor_type" "AuditActorType" NOT NULL DEFAULT 'USER',
  ADD COLUMN "actor_label" TEXT,
  ADD COLUMN "request_id" TEXT,
  ADD COLUMN "source" TEXT,
  ADD COLUMN "changes" JSONB;

-- 2. Rattrapage des lignes existantes ---------------------------------------
--
-- Le catalogue TypeScript (`types/audit-catalog.ts`) reste la reference pour
-- les lignes futures ; ce rattrapage en reprend les regles pour l'historique.

UPDATE "audit_logs"
SET "scope" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM'::"AuditScope" ELSE 'TENANT'::"AuditScope" END;

-- Categorie et visibilite, GENEREES depuis `types/audit-catalog.ts` (une
-- requete par couple categorie/visibilite). Une ligne sans agence reste
-- PLATFORM_ONLY ; une cle absente du catalogue garde les valeurs par defaut
-- (DATA, PLATFORM_ONLY) : fermee par defaut. `__tests__/unit/audit-catalog.test.ts`
-- verifie que ce fichier et le catalogue disent la meme chose.
UPDATE "audit_logs"
SET "category" = 'ADMIN',
    "visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE 'TENANT'::"AuditVisibility" END
WHERE "action_key" IN (
  'TENANT_CREATED',
  'TENANT_UPDATED',
  'TENANT_SUSPENDED',
  'TENANT_ACTIVATED',
  'MODULE_ENABLED',
  'MODULE_DISABLED',
  'USER_INVITED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DISABLED',
  'USER_ENABLED',
  'SYNDIC_COOWNER_PORTAL_INVITED',
  'DOCUMENT_TEMPLATE_UPLOADED',
  'DOCUMENT_TEMPLATE_ACTIVATED',
  'DOCUMENT_TEMPLATE_DEACTIVATED',
  'DOCUMENT_TEMPLATE_SET_DEFAULT',
  'DOCUMENT_TEMPLATE_DELETED',
  'TENANT_PROVISIONED'
);

UPDATE "audit_logs"
SET "category" = 'AI',
    "visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE 'PLATFORM_ONLY'::"AuditVisibility" END
WHERE "action_key" IN (
  'AI_SETTINGS_UPDATED'
);

UPDATE "audit_logs"
SET "category" = 'AI',
    "visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE 'TENANT'::"AuditVisibility" END
WHERE "action_key" IN (
  'AI_CHAT_TURN',
  'AI_TOOL_CALLED',
  'AI_PROPOSAL_ISSUED',
  'AI_PROPOSAL_REDEEMED',
  'AI_ACTION_EXECUTED',
  'AI_ACTION_REJECTED'
);

UPDATE "audit_logs"
SET "category" = 'AUTH',
    "visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE 'TENANT'::"AuditVisibility" END
WHERE "action_key" IN (
  'AUTH_LOGIN_SUCCEEDED',
  'AUTH_LOGIN_FAILED',
  'AUTH_LOGOUT',
  'AUTH_GOOGLE_LOGIN',
  'AUTH_TOKEN_REFRESHED',
  'AUTH_PASSWORD_RESET_REQUESTED',
  'AUTH_EMAIL_VERIFIED'
);

UPDATE "audit_logs"
SET "category" = 'BILLING',
    "visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE 'PLATFORM_ONLY'::"AuditVisibility" END
WHERE "action_key" IN (
  'SUBSCRIPTION_SETTINGS_UPDATED',
  'SUBSCRIPTION_MIGRATED_TO_PACKS',
  'CAPACITY_OVERRIDE_GRANTED',
  'CAPACITY_OVERRIDE_REVOKED',
  'CATALOG_ITEM_UPDATED',
  'MODULE_OVERRIDE_CLEARED'
);

UPDATE "audit_logs"
SET "category" = 'BILLING',
    "visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE 'TENANT'::"AuditVisibility" END
WHERE "action_key" IN (
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_UPDATED',
  'SUBSCRIPTION_CANCELED',
  'SUBSCRIPTION_ITEM_ADDED',
  'SUBSCRIPTION_ITEM_REMOVED',
  'SUBSCRIPTION_PACK_CHANGED',
  'SUBSCRIPTION_MANUAL_READ_ONLY_SET',
  'SUBSCRIPTION_MANUAL_READ_ONLY_CLEARED',
  'SUBSCRIPTION_ITEM_UPDATED',
  'SUBSCRIPTION_EXTENSION_REQUESTED',
  'SUBSCRIPTION_EXTENSION_REQUEST_HANDLED',
  'PLATFORM_PAYMENT_STARTED',
  'INVOICE_CREATED',
  'INVOICE_MARKED_PAID',
  'INVOICE_CANCELED',
  'INVOICE_ISSUED',
  'INVOICE_CREDIT_NOTE_ISSUED',
  'SUBSCRIPTION_PROVISIONED'
);

UPDATE "audit_logs"
SET "category" = 'DATA',
    "visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE 'TENANT'::"AuditVisibility" END
WHERE "action_key" IN (
  'CRM_FOLLOWUP_RESCHEDULED',
  'CRM_FOLLOWUP_MARKED_DONE',
  'PROPERTY_CREATED',
  'PROPERTY_UPDATED',
  'PROPERTY_DELETED',
  'PROPERTY_PUBLISHED',
  'PROPERTY_UNPUBLISHED',
  'PROPERTY_STATUS_CHANGED',
  'PROPERTY_MEDIA_UPLOADED',
  'PROPERTY_DOCUMENT_UPLOADED',
  'PROPERTY_MANDATE_CREATED',
  'PROPERTY_MANDATE_REVOKED',
  'PROPERTY_VISIT_SCHEDULED',
  'SYNDICATE_FUND_CREATED',
  'SYNDICATE_FUND_RENAMED',
  'SYNDICATE_FUND_BALANCE_ADJUSTED',
  'SYNDICATE_FUND_ASSIGNMENT_CHANGED',
  'SYNDIC_PROVIDER_INVOICE_FILE_ATTACHED',
  'SYNDIC_PROVIDER_INVOICE_FILE_REPLACED',
  'SYNDIC_PROVIDER_INVOICE_FILE_REMOVED',
  'SYNDIC_CHARGE_RECEIPT_EMAIL_RESENT',
  'DOCUMENT_SIGNATURE_UPLOADED',
  'DOCUMENT_SIGNATURE_REMOVED',
  'CRM_ACTIVITY_CREATED',
  'CRM_CONTACT_CREATED',
  'CRM_CONTACT_UPDATED',
  'CRM_CONTACT_DELETED',
  'CRM_CONTACT_CONVERTED',
  'CRM_CONTACT_ROLES_UPDATED',
  'CRM_CONTACT_ROLE_DELETED',
  'CRM_DEAL_CREATED',
  'DOCUMENT_GENERATED',
  'DOCUMENT_REGENERATED',
  'MAINTENANCE_TICKET_CREATED',
  'MAINTENANCE_VENDOR_CREATED',
  'MAINTENANCE_VENDOR_UPDATED',
  'MAINTENANCE_VENDOR_DEACTIVATED',
  'MAINTENANCE_VENDOR_DELETED',
  'RENTAL_LEASE_CREATED',
  'RENTAL_LEASE_UPDATED',
  'RENTAL_LEASE_STATUS_UPDATED',
  'RENTAL_LEASE_DELETED',
  'RENTAL_LEASE_CO_RENTER_ADDED',
  'RENTAL_LEASE_CO_RENTER_REMOVED',
  'RENTAL_LEASE_RENT_REVISED',
  'RENTAL_LEASE_RENEWED',
  'RENTAL_LEASE_AMENDED',
  'RENTAL_LEASE_TERMINATED',
  'RENTAL_DOCUMENT_GENERATED',
  'RENTAL_DOCUMENT_STATUS_UPDATED',
  'RENTAL_DEPOSIT_CREATED',
  'RENTAL_DEPOSIT_MOVEMENT_CREATED',
  'RENTAL_PENALTY_UPDATED',
  'RENTAL_PENALTY_DELETED',
  'RENTAL_PENALTY_JUSTIFICATION_UPLOADED',
  'PATRIMOINE_WORK_PROGRAM_COST_OVERRIDDEN'
);

UPDATE "audit_logs"
SET "category" = 'EXPORT',
    "visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE 'TENANT'::"AuditVisibility" END
WHERE "action_key" IN (
  'TENANT_DATA_EXPORT_REQUESTED',
  'TENANT_DATA_EXPORT_DOWNLOADED',
  'TENANT_DATA_EXPORT_DELETED'
);

UPDATE "audit_logs"
SET "category" = 'SECURITY',
    "visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE 'TENANT'::"AuditVisibility" END
WHERE "action_key" IN (
  'AUTH_TOKEN_REUSE_DETECTED',
  'AUTH_PASSWORD_RESET_COMPLETED',
  'ROLE_ASSIGNED',
  'ROLE_REMOVED',
  'PASSWORD_RESET',
  'SESSIONS_REVOKED',
  'SYNDIC_COOWNER_PORTAL_REVOKED',
  'AI_TOOL_DENIED'
);

UPDATE "audit_logs"
SET "category" = 'SYSTEM',
    "visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE 'PLATFORM_ONLY'::"AuditVisibility" END
WHERE "action_key" IN (
  'PATRIMOINE_LEASE_END_ALERT_SENT',
  'PATRIMOINE_LOAN_MATURITY_ALERT_SENT',
  'PATRIMOINE_WORK_UPCOMING_ALERT_SENT',
  'LOT_REGISTRY_RECONCILED',
  'SYNDIC_MEETING_CONVOCATION_DELIVERY'
);

UPDATE "audit_logs"
SET "category" = 'SYSTEM',
    "visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE 'TENANT'::"AuditVisibility" END
WHERE "action_key" IN (
  'RENTAL_INSTALLMENT_MARKED_OVERDUE',
  'RENTAL_PENALTY_CALCULATED'
);

UPDATE "audit_logs"
SET "actor_type" = 'SYSTEM'
WHERE "actor_user_id" IS NULL
  AND "action_key" NOT LIKE 'AUTH\_%';

-- 3. Invariant et index ------------------------------------------------------

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_scope_tenant_check"
  CHECK ("scope" = 'PLATFORM' OR "tenant_id" IS NOT NULL);

CREATE INDEX "audit_logs_tenant_id_visibility_created_at_idx"
  ON "audit_logs"("tenant_id", "visibility", "created_at" DESC);
CREATE INDEX "audit_logs_scope_created_at_idx"
  ON "audit_logs"("scope", "created_at" DESC);
CREATE INDEX "audit_logs_request_id_idx"
  ON "audit_logs"("request_id");

-- 4. Immuabilite -------------------------------------------------------------
--
-- Une piste d'audit qu'on peut reecrire ne prouve rien. Le declencheur refuse
-- tout UPDATE, et tout DELETE sauf dans une session qui a pose
-- `app.audit_purge = 'on'` (reserve a la fonction de purge de retention, phase
-- 5). Un TRUNCATE n'est pas concerne par un declencheur de ligne : la remise a
-- zero d'une base de recette reste possible.

CREATE OR REPLACE FUNCTION "audit_logs_block_mutation"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs est en ajout seul : % refuse', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_immutable"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_block_mutation"();
