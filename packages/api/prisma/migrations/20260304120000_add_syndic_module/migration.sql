CREATE TYPE "SyndicateStatus" AS ENUM ('ACTIVE', 'IN_LIQUIDATION', 'IN_DISPUTE');
CREATE TYPE "LotType" AS ENUM ('APARTMENT', 'PARKING', 'CELLAR', 'OFFICE', 'COMMERCIAL', 'OTHER');
CREATE TYPE "ChargeCallStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');
CREATE TYPE "MeetingType" AS ENUM ('ORDINARY', 'EXTRAORDINARY');
CREATE TYPE "MeetingStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ResolutionResult" AS ENUM ('APPROVED', 'REJECTED', 'DEFERRED');
CREATE TYPE "VoteChoice" AS ENUM ('FOR', 'AGAINST', 'ABSTAIN');
CREATE TYPE "SyndicateDocType" AS ENUM ('REGULATION', 'GENERAL_MEETING_MINUTES', 'DIAGNOSTIC', 'INSURANCE', 'BUDGET', 'OTHER');
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED');

CREATE TABLE "syndicates" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "cadastral_reference" TEXT,
  "total_lots" INTEGER NOT NULL DEFAULT 0,
  "total_buildings" INTEGER NOT NULL DEFAULT 1,
  "status" "SyndicateStatus" NOT NULL DEFAULT 'ACTIVE',
  "regulation_doc_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "syndicates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "syndicate_lots" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "property_id" TEXT,
  "owner_contact_id" TEXT,
  "lot_number" TEXT NOT NULL,
  "lot_type" "LotType" NOT NULL,
  "general_shares" INTEGER NOT NULL,
  "special_shares" INTEGER,
  "owner_since" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "syndicate_lots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "charge_calls" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "period" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "due_date" TIMESTAMP(3) NOT NULL,
  "status" "ChargeCallStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "charge_calls_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "charge_payments" (
  "id" UUID NOT NULL,
  "charge_call_id" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paid_at" TIMESTAMP(3) NOT NULL,
  "method" TEXT,
  "reference" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "charge_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "general_meetings" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "meeting_type" "MeetingType" NOT NULL,
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "location" TEXT,
  "quorum" DECIMAL(5,2),
  "status" "MeetingStatus" NOT NULL DEFAULT 'PLANNED',
  "minutes_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "general_meetings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gm_resolutions" (
  "id" UUID NOT NULL,
  "meeting_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "majority_rule" TEXT,
  "result" "ResolutionResult",
  "votes_for" INTEGER NOT NULL DEFAULT 0,
  "votes_against" INTEGER NOT NULL DEFAULT 0,
  "votes_abstain" INTEGER NOT NULL DEFAULT 0,
  "shares_for" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gm_resolutions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gm_votes" (
  "id" UUID NOT NULL,
  "resolution_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "vote" "VoteChoice" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gm_votes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gm_proxies" (
  "id" UUID NOT NULL,
  "meeting_id" UUID NOT NULL,
  "grantor_contact_id" TEXT NOT NULL,
  "representative_contact_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gm_proxies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_providers" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "specialty" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_providers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "maintenance_contracts" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "provider_id" UUID NOT NULL,
  "nature" TEXT NOT NULL,
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3),
  "annual_amount" DECIMAL(12,2),
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "renewal_alert_days" INTEGER NOT NULL DEFAULT 30,
  "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "maintenance_contracts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "common_area_assets" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "last_maintenance_date" TIMESTAMP(3),
  "next_maintenance_date" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "common_area_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "syndicate_documents" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "type" "SyndicateDocType" NOT NULL,
  "file_url" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "syndicate_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "syndicate_funds" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "syndicate_funds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "syndicates_tenant_id_idx" ON "syndicates"("tenant_id");
CREATE INDEX "syndicates_tenant_id_name_idx" ON "syndicates"("tenant_id", "name");
CREATE INDEX "syndicate_lots_syndicate_id_idx" ON "syndicate_lots"("syndicate_id");
CREATE INDEX "syndicate_lots_syndicate_id_lot_number_idx" ON "syndicate_lots"("syndicate_id", "lot_number");
CREATE INDEX "syndicate_lots_owner_contact_id_idx" ON "syndicate_lots"("owner_contact_id");
CREATE INDEX "charge_calls_syndicate_id_idx" ON "charge_calls"("syndicate_id");
CREATE INDEX "charge_calls_lot_id_idx" ON "charge_calls"("lot_id");
CREATE INDEX "charge_calls_syndicate_id_period_idx" ON "charge_calls"("syndicate_id", "period");
CREATE INDEX "charge_calls_status_idx" ON "charge_calls"("status");
CREATE INDEX "charge_calls_due_date_idx" ON "charge_calls"("due_date");
CREATE INDEX "charge_payments_charge_call_id_idx" ON "charge_payments"("charge_call_id");
CREATE INDEX "general_meetings_syndicate_id_idx" ON "general_meetings"("syndicate_id");
CREATE INDEX "general_meetings_status_idx" ON "general_meetings"("status");
CREATE INDEX "general_meetings_scheduled_at_idx" ON "general_meetings"("scheduled_at");
CREATE INDEX "gm_resolutions_meeting_id_idx" ON "gm_resolutions"("meeting_id");
CREATE INDEX "gm_votes_resolution_id_idx" ON "gm_votes"("resolution_id");
CREATE INDEX "gm_votes_lot_id_idx" ON "gm_votes"("lot_id");
CREATE UNIQUE INDEX "gm_votes_resolution_id_lot_id_key" ON "gm_votes"("resolution_id", "lot_id");
CREATE INDEX "gm_proxies_meeting_id_idx" ON "gm_proxies"("meeting_id");
CREATE INDEX "gm_proxies_grantor_contact_id_idx" ON "gm_proxies"("grantor_contact_id");
CREATE INDEX "gm_proxies_representative_contact_id_idx" ON "gm_proxies"("representative_contact_id");
CREATE INDEX "service_providers_tenant_id_idx" ON "service_providers"("tenant_id");
CREATE INDEX "service_providers_tenant_id_name_idx" ON "service_providers"("tenant_id", "name");
CREATE INDEX "maintenance_contracts_syndicate_id_idx" ON "maintenance_contracts"("syndicate_id");
CREATE INDEX "maintenance_contracts_provider_id_idx" ON "maintenance_contracts"("provider_id");
CREATE INDEX "maintenance_contracts_status_idx" ON "maintenance_contracts"("status");
CREATE INDEX "common_area_assets_syndicate_id_idx" ON "common_area_assets"("syndicate_id");
CREATE INDEX "syndicate_documents_syndicate_id_idx" ON "syndicate_documents"("syndicate_id");
CREATE INDEX "syndicate_documents_syndicate_id_type_idx" ON "syndicate_documents"("syndicate_id", "type");
CREATE INDEX "syndicate_documents_expires_at_idx" ON "syndicate_documents"("expires_at");
CREATE INDEX "syndicate_funds_syndicate_id_idx" ON "syndicate_funds"("syndicate_id");

ALTER TABLE "syndicates"
  ADD CONSTRAINT "syndicates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "syndicate_lots"
  ADD CONSTRAINT "syndicate_lots_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "syndicate_lots"
  ADD CONSTRAINT "syndicate_lots_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "syndicate_lots"
  ADD CONSTRAINT "syndicate_lots_owner_contact_id_fkey" FOREIGN KEY ("owner_contact_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "charge_calls"
  ADD CONSTRAINT "charge_calls_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charge_calls"
  ADD CONSTRAINT "charge_calls_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charge_payments"
  ADD CONSTRAINT "charge_payments_charge_call_id_fkey" FOREIGN KEY ("charge_call_id") REFERENCES "charge_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "general_meetings"
  ADD CONSTRAINT "general_meetings_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gm_resolutions"
  ADD CONSTRAINT "gm_resolutions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "general_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gm_votes"
  ADD CONSTRAINT "gm_votes_resolution_id_fkey" FOREIGN KEY ("resolution_id") REFERENCES "gm_resolutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gm_votes"
  ADD CONSTRAINT "gm_votes_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gm_proxies"
  ADD CONSTRAINT "gm_proxies_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "general_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gm_proxies"
  ADD CONSTRAINT "gm_proxies_grantor_contact_id_fkey" FOREIGN KEY ("grantor_contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gm_proxies"
  ADD CONSTRAINT "gm_proxies_representative_contact_id_fkey" FOREIGN KEY ("representative_contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_providers"
  ADD CONSTRAINT "service_providers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maintenance_contracts"
  ADD CONSTRAINT "maintenance_contracts_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maintenance_contracts"
  ADD CONSTRAINT "maintenance_contracts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "service_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "common_area_assets"
  ADD CONSTRAINT "common_area_assets_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "syndicate_documents"
  ADD CONSTRAINT "syndicate_documents_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "syndicate_funds"
  ADD CONSTRAINT "syndicate_funds_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
