/*
  Warnings:

  - The primary key for the `email_notification_configs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `whatsapp_notification_configs` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[open_token]` on the table `newsletter_campaign_recipients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[property_id]` on the table `syndicate_lots` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[property_id]` on the table `syndicates` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CostImputationType" AS ENUM ('SYNDICATE', 'LOT_OWNER', 'LOT_TENANT', 'MIXED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CrmContactRoleType" ADD VALUE 'COOWNER';
ALTER TYPE "CrmContactRoleType" ADD VALUE 'TENANT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PropertyDocumentType" ADD VALUE 'SYNDICATE_PV';
ALTER TYPE "PropertyDocumentType" ADD VALUE 'SYNDICATE_BUDGET';
ALTER TYPE "PropertyDocumentType" ADD VALUE 'SYNDICATE_CONTRAT';
ALTER TYPE "PropertyDocumentType" ADD VALUE 'SYNDICATE_REGL_COPRO';

-- DropForeignKey
ALTER TABLE "budget_allocations" DROP CONSTRAINT "budget_allocations_budget_id_fkey";

-- DropForeignKey
ALTER TABLE "budget_line_items" DROP CONSTRAINT "budget_line_items_account_id_fkey";

-- DropForeignKey
ALTER TABLE "budget_line_items" DROP CONSTRAINT "budget_line_items_budget_id_fkey";

-- DropForeignKey
ALTER TABLE "charge_call_batches" DROP CONSTRAINT "charge_call_batches_budget_id_fkey";

-- DropForeignKey
ALTER TABLE "charge_calls" DROP CONSTRAINT "charge_calls_batch_id_fkey";

-- DropForeignKey
ALTER TABLE "charge_payments" DROP CONSTRAINT "charge_payments_charge_call_id_fkey";

-- DropForeignKey
ALTER TABLE "chart_of_accounts" DROP CONSTRAINT "chart_of_accounts_parent_account_id_fkey";

-- DropForeignKey
ALTER TABLE "gm_agenda_items" DROP CONSTRAINT "gm_agenda_items_meeting_id_fkey";

-- DropForeignKey
ALTER TABLE "gm_proxies" DROP CONSTRAINT "gm_proxies_meeting_id_fkey";

-- DropForeignKey
ALTER TABLE "gm_resolutions" DROP CONSTRAINT "gm_resolutions_meeting_id_fkey";

-- DropForeignKey
ALTER TABLE "gm_votes" DROP CONSTRAINT "gm_votes_resolution_id_fkey";

-- DropForeignKey
ALTER TABLE "incident_cost_imputations" DROP CONSTRAINT "incident_cost_imputations_budget_line_id_fkey";

-- DropForeignKey
ALTER TABLE "incident_cost_imputations" DROP CONSTRAINT "incident_cost_imputations_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "incident_cost_imputations" DROP CONSTRAINT "incident_cost_imputations_incident_id_fkey";

-- DropForeignKey
ALTER TABLE "incident_cost_imputations" DROP CONSTRAINT "incident_cost_imputations_lot_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_journal_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_entry_lines" DROP CONSTRAINT "journal_entry_lines_account_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_entry_lines" DROP CONSTRAINT "journal_entry_lines_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_entry_lines" DROP CONSTRAINT "journal_entry_lines_lot_id_fkey";

-- DropForeignKey
ALTER TABLE "late_payment_penalties" DROP CONSTRAINT "late_payment_penalties_charge_call_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_contracts" DROP CONSTRAINT "maintenance_contracts_provider_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_ticket_attachments" DROP CONSTRAINT "maintenance_ticket_attachments_uploaded_by_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_ticket_attachments" DROP CONSTRAINT "maintenance_ticket_attachments_uploaded_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_ticket_comments" DROP CONSTRAINT "maintenance_ticket_comments_author_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_ticket_comments" DROP CONSTRAINT "maintenance_ticket_comments_author_user_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_ticket_status_history" DROP CONSTRAINT "maintenance_ticket_status_history_changed_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_tickets" DROP CONSTRAINT "maintenance_tickets_assigned_to_user_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_tickets" DROP CONSTRAINT "maintenance_tickets_assigned_vendor_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_tickets" DROP CONSTRAINT "maintenance_tickets_created_by_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_tickets" DROP CONSTRAINT "maintenance_tickets_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_tickets" DROP CONSTRAINT "maintenance_tickets_lease_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_tickets" DROP CONSTRAINT "maintenance_tickets_property_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_tickets" DROP CONSTRAINT "maintenance_tickets_tenant_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "owner_account_transactions" DROP CONSTRAINT "owner_account_transactions_account_id_fkey";

-- DropForeignKey
ALTER TABLE "owner_accounts" DROP CONSTRAINT "owner_accounts_lot_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_reminders" DROP CONSTRAINT "payment_reminders_charge_call_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_schedule_instalments" DROP CONSTRAINT "payment_schedule_instalments_schedule_id_fkey";

-- DropForeignKey
ALTER TABLE "payment_schedules" DROP CONSTRAINT "payment_schedules_charge_call_id_fkey";

-- DropForeignKey
ALTER TABLE "syndicate_budgets" DROP CONSTRAINT "syndicate_budgets_approved_by_resolution_id_fkey";

-- DropForeignKey
ALTER TABLE "syndicate_incidents" DROP CONSTRAINT "syndicate_incidents_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "syndicate_incidents" DROP CONSTRAINT "syndicate_incidents_lot_id_fkey";

-- DropForeignKey
ALTER TABLE "syndicate_incidents" DROP CONSTRAINT "syndicate_incidents_provider_id_fkey";

-- AlterTable
ALTER TABLE "budget_allocations" ALTER COLUMN "budget_id" SET DATA TYPE UUID USING ("budget_id"::uuid);

-- AlterTable
ALTER TABLE "budget_line_items" ALTER COLUMN "budget_id" SET DATA TYPE UUID USING ("budget_id"::uuid),
ALTER COLUMN "account_id" SET DATA TYPE UUID USING ("account_id"::uuid);

-- AlterTable
ALTER TABLE "charge_call_batches" ALTER COLUMN "budget_id" SET DATA TYPE UUID USING ("budget_id"::uuid);

-- AlterTable
ALTER TABLE "charge_calls" ALTER COLUMN "batch_id" SET DATA TYPE UUID USING ("batch_id"::uuid);

-- AlterTable
ALTER TABLE "charge_payments" ALTER COLUMN "charge_call_id" SET DATA TYPE UUID USING ("charge_call_id"::uuid);

-- AlterTable
ALTER TABLE "chart_of_accounts" ALTER COLUMN "parent_account_id" SET DATA TYPE UUID USING ("parent_account_id"::uuid);

-- AlterTable
ALTER TABLE "email_notification_configs" DROP CONSTRAINT "email_notification_configs_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "notification_key" SET DATA TYPE TEXT,
ADD CONSTRAINT "email_notification_configs_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "gm_agenda_items" ALTER COLUMN "meeting_id" SET DATA TYPE UUID USING ("meeting_id"::uuid);

-- AlterTable
ALTER TABLE "gm_proxies" ALTER COLUMN "meeting_id" SET DATA TYPE UUID USING ("meeting_id"::uuid);

-- AlterTable
ALTER TABLE "gm_resolutions" ALTER COLUMN "meeting_id" SET DATA TYPE UUID USING ("meeting_id"::uuid);

-- AlterTable
ALTER TABLE "gm_votes" ALTER COLUMN "resolution_id" SET DATA TYPE UUID USING ("resolution_id"::uuid);

-- AlterTable
ALTER TABLE "incident_cost_imputations" ALTER COLUMN "incident_id" SET DATA TYPE UUID USING ("incident_id"::uuid),
ALTER COLUMN "budget_line_id" SET DATA TYPE UUID USING ("budget_line_id"::uuid),
ALTER COLUMN "lot_id" SET DATA TYPE UUID USING ("lot_id"::uuid),
ALTER COLUMN "contract_id" SET DATA TYPE UUID USING ("contract_id"::uuid),
ALTER COLUMN "journal_entry_id" SET DATA TYPE UUID USING ("journal_entry_id"::uuid);

-- AlterTable
ALTER TABLE "journal_entries" ALTER COLUMN "journal_id" SET DATA TYPE UUID USING ("journal_id"::uuid);

-- AlterTable
ALTER TABLE "journal_entry_lines" ALTER COLUMN "entry_id" SET DATA TYPE UUID USING ("entry_id"::uuid),
ALTER COLUMN "account_id" SET DATA TYPE UUID USING ("account_id"::uuid),
ALTER COLUMN "lot_id" SET DATA TYPE UUID USING ("lot_id"::uuid);

-- AlterTable
ALTER TABLE "late_payment_penalties" ALTER COLUMN "charge_call_id" SET DATA TYPE UUID USING ("charge_call_id"::uuid),
ALTER COLUMN "journal_entry_id" SET DATA TYPE UUID USING ("journal_entry_id"::uuid);

-- AlterTable
ALTER TABLE "maintenance_contracts" ALTER COLUMN "provider_id" SET DATA TYPE UUID USING ("provider_id"::uuid);

-- AlterTable
ALTER TABLE "owner_account_transactions" ALTER COLUMN "account_id" SET DATA TYPE UUID USING ("account_id"::uuid);

-- AlterTable
ALTER TABLE "owner_accounts" ALTER COLUMN "lot_id" SET DATA TYPE UUID USING ("lot_id"::uuid);

-- AlterTable
ALTER TABLE "payment_reminders" ALTER COLUMN "charge_call_id" SET DATA TYPE UUID USING ("charge_call_id"::uuid);

-- AlterTable
ALTER TABLE "payment_schedule_instalments" ALTER COLUMN "schedule_id" SET DATA TYPE UUID USING ("schedule_id"::uuid);

-- AlterTable
ALTER TABLE "payment_schedules" ALTER COLUMN "charge_call_id" SET DATA TYPE UUID USING ("charge_call_id"::uuid);

-- AlterTable
ALTER TABLE "syndicate_budgets" ALTER COLUMN "approved_by_resolution_id" SET DATA TYPE UUID USING ("approved_by_resolution_id"::uuid);

-- AlterTable
ALTER TABLE "syndicate_incidents" ALTER COLUMN "lot_id" SET DATA TYPE UUID USING ("lot_id"::uuid),
ALTER COLUMN "asset_id" SET DATA TYPE UUID USING ("asset_id"::uuid),
ALTER COLUMN "provider_id" SET DATA TYPE UUID USING ("provider_id"::uuid);

-- AlterTable
ALTER TABLE "syndicate_lots" ADD COLUMN     "coowner_id" TEXT;

-- AlterTable
ALTER TABLE "syndicates" ADD COLUMN     "fiscal_year" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "property_id" TEXT,
ADD COLUMN     "registration_no" TEXT,
ADD COLUMN     "syndic_manager_id" TEXT;

-- AlterTable
ALTER TABLE "tenant_clients" ADD COLUMN     "owner_portal_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "owner_portal_last_access" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "whatsapp_notification_configs" DROP CONSTRAINT "whatsapp_notification_configs_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "whatsapp_notification_configs_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "communications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "recipient_tenant_client_id" TEXT,
    "recipient_contact_id" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_preferences" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tenant_client_id" TEXT,
    "contact_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_tenant_assignments" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_tenant_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndicate_maintenance_links" (
    "id" UUID NOT NULL,
    "syndicate_id" UUID NOT NULL,
    "maintenance_request_id" UUID NOT NULL,
    "lot_id" UUID,
    "is_common_area" BOOLEAN NOT NULL DEFAULT false,
    "cost_imputation" "CostImputationType" NOT NULL DEFAULT 'SYNDICATE',
    "imputation_detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syndicate_maintenance_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndicate_contract_links" (
    "id" UUID NOT NULL,
    "syndicate_id" UUID NOT NULL,
    "maintenance_contract_id" UUID NOT NULL,
    "scope" TEXT,
    "budget_line_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syndicate_contract_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communications_tenant_id_idx" ON "communications"("tenant_id");

-- CreateIndex
CREATE INDEX "communication_preferences_tenant_id_idx" ON "communication_preferences"("tenant_id");

-- CreateIndex
CREATE INDEX "lot_tenant_assignments_lot_id_idx" ON "lot_tenant_assignments"("lot_id");

-- CreateIndex
CREATE INDEX "lot_tenant_assignments_tenant_id_idx" ON "lot_tenant_assignments"("tenant_id");

-- CreateIndex
CREATE INDEX "lot_tenant_assignments_lot_id_is_active_idx" ON "lot_tenant_assignments"("lot_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "syndicate_maintenance_links_maintenance_request_id_key" ON "syndicate_maintenance_links"("maintenance_request_id");

-- CreateIndex
CREATE INDEX "syndicate_maintenance_links_syndicate_id_idx" ON "syndicate_maintenance_links"("syndicate_id");

-- CreateIndex
CREATE INDEX "syndicate_maintenance_links_lot_id_idx" ON "syndicate_maintenance_links"("lot_id");

-- CreateIndex
CREATE INDEX "syndicate_contract_links_syndicate_id_idx" ON "syndicate_contract_links"("syndicate_id");

-- CreateIndex
CREATE INDEX "syndicate_contract_links_maintenance_contract_id_idx" ON "syndicate_contract_links"("maintenance_contract_id");

-- CreateIndex

-- CreateIndex
CREATE INDEX "newsletter_subscribers_confirmation_token_idx" ON "newsletter_subscribers"("confirmation_token");

-- CreateIndex
CREATE UNIQUE INDEX "syndicate_lots_property_id_key" ON "syndicate_lots"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "syndicates_property_id_key" ON "syndicates"("property_id");

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_tenant_contact_id_fkey" FOREIGN KEY ("tenant_contact_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_created_by_contact_id_fkey" FOREIGN KEY ("created_by_contact_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_assigned_vendor_id_fkey" FOREIGN KEY ("assigned_vendor_id") REFERENCES "maintenance_vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket_attachments" ADD CONSTRAINT "maintenance_ticket_attachments_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket_attachments" ADD CONSTRAINT "maintenance_ticket_attachments_uploaded_by_contact_id_fkey" FOREIGN KEY ("uploaded_by_contact_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_author_contact_id_fkey" FOREIGN KEY ("author_contact_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_ticket_status_history" ADD CONSTRAINT "maintenance_ticket_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_recipient_tenant_client_id_fkey" FOREIGN KEY ("recipient_tenant_client_id") REFERENCES "tenant_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_recipient_contact_id_fkey" FOREIGN KEY ("recipient_contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_tenant_client_id_fkey" FOREIGN KEY ("tenant_client_id") REFERENCES "tenant_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_preferences" ADD CONSTRAINT "communication_preferences_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicates" ADD CONSTRAINT "syndicates_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicates" ADD CONSTRAINT "syndicates_syndic_manager_id_fkey" FOREIGN KEY ("syndic_manager_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_lots" ADD CONSTRAINT "syndicate_lots_coowner_id_fkey" FOREIGN KEY ("coowner_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_tenant_assignments" ADD CONSTRAINT "lot_tenant_assignments_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_tenant_assignments" ADD CONSTRAINT "lot_tenant_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_maintenance_links" ADD CONSTRAINT "syndicate_maintenance_links_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_maintenance_links" ADD CONSTRAINT "syndicate_maintenance_links_maintenance_request_id_fkey" FOREIGN KEY ("maintenance_request_id") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_maintenance_links" ADD CONSTRAINT "syndicate_maintenance_links_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_contract_links" ADD CONSTRAINT "syndicate_contract_links_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_contract_links" ADD CONSTRAINT "syndicate_contract_links_maintenance_contract_id_fkey" FOREIGN KEY ("maintenance_contract_id") REFERENCES "maintenance_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_calls" ADD CONSTRAINT "charge_calls_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "charge_call_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_payments" ADD CONSTRAINT "charge_payments_charge_call_id_fkey" FOREIGN KEY ("charge_call_id") REFERENCES "charge_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gm_agenda_items" ADD CONSTRAINT "gm_agenda_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "general_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gm_resolutions" ADD CONSTRAINT "gm_resolutions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "general_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gm_votes" ADD CONSTRAINT "gm_votes_resolution_id_fkey" FOREIGN KEY ("resolution_id") REFERENCES "gm_resolutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gm_proxies" ADD CONSTRAINT "gm_proxies_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "general_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "service_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_call_batches" ADD CONSTRAINT "charge_call_batches_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "syndicate_budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_charge_call_id_fkey" FOREIGN KEY ("charge_call_id") REFERENCES "charge_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_payment_penalties" ADD CONSTRAINT "late_payment_penalties_charge_call_id_fkey" FOREIGN KEY ("charge_call_id") REFERENCES "charge_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_charge_call_id_fkey" FOREIGN KEY ("charge_call_id") REFERENCES "charge_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedule_instalments" ADD CONSTRAINT "payment_schedule_instalments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "payment_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_budgets" ADD CONSTRAINT "syndicate_budgets_approved_by_resolution_id_fkey" FOREIGN KEY ("approved_by_resolution_id") REFERENCES "gm_resolutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "syndicate_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_allocations" ADD CONSTRAINT "budget_allocations_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "syndicate_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "accounting_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_accounts" ADD CONSTRAINT "owner_accounts_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_account_transactions" ADD CONSTRAINT "owner_account_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "owner_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_incidents" ADD CONSTRAINT "syndicate_incidents_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_incidents" ADD CONSTRAINT "syndicate_incidents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "common_area_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndicate_incidents" ADD CONSTRAINT "syndicate_incidents_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "service_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_cost_imputations" ADD CONSTRAINT "incident_cost_imputations_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "syndicate_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_cost_imputations" ADD CONSTRAINT "incident_cost_imputations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_cost_imputations" ADD CONSTRAINT "incident_cost_imputations_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "maintenance_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_cost_imputations" ADD CONSTRAINT "incident_cost_imputations_budget_line_id_fkey" FOREIGN KEY ("budget_line_id") REFERENCES "budget_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;


