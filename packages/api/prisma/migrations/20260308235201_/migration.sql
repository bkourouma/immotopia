/*
  Warnings:

  - A unique constraint covering the columns `[open_token]` on the table `newsletter_campaign_recipients` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "budget_allocations" DROP CONSTRAINT "budget_allocations_budget_id_fkey";

-- DropForeignKey
ALTER TABLE "budget_line_items" DROP CONSTRAINT "budget_line_items_account_id_fkey";

-- DropForeignKey
ALTER TABLE "budget_line_items" DROP CONSTRAINT "budget_line_items_budget_id_fkey";

-- DropForeignKey
ALTER TABLE "charge_call_batches" DROP CONSTRAINT "charge_call_batches_budget_id_fkey";

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
ALTER TABLE "charge_payments" ALTER COLUMN "charge_call_id" SET DATA TYPE UUID USING ("charge_call_id"::uuid);

-- AlterTable
ALTER TABLE "chart_of_accounts" ALTER COLUMN "parent_account_id" SET DATA TYPE UUID USING ("parent_account_id"::uuid);

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

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_campaign_recipients_open_token_key" ON "newsletter_campaign_recipients"("open_token");

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


