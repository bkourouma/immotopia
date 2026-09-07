CREATE TYPE "BatchType" AS ENUM ('REGULAR', 'EXCEPTIONAL');
CREATE TYPE "BatchStatus" AS ENUM ('DRAFT', 'SENT', 'CLOSED');
CREATE TYPE "PaymentType" AS ENUM ('MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'CHECK', 'CARD');
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH');
CREATE TYPE "ReminderStatus" AS ENUM ('SENT', 'DELIVERED', 'FAILED');
CREATE TYPE "ScheduleStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DEFAULTED');
CREATE TYPE "InstalmentStatus" AS ENUM ('PENDING', 'PAID', 'LATE');
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
CREATE TYPE "JournalType" AS ENUM ('GENERAL', 'BANK', 'CASH', 'CHARGES');
CREATE TYPE "SourceType" AS ENUM ('CHARGE_PAYMENT', 'MANUAL', 'PENALTY', 'FUND');
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'APPROVED', 'REVISED', 'CLOSED');
CREATE TYPE "DistributionKey" AS ENUM ('GENERAL_SHARES', 'SPECIAL_SHARES', 'EQUAL', 'MANUAL');
CREATE TYPE "TransactionType" AS ENUM ('CHARGE_CALL', 'PAYMENT', 'PENALTY', 'WAIVER', 'ADJUSTMENT', 'FUND_TRANSFER');
CREATE TYPE "IncidentType" AS ENUM ('BREAKDOWN', 'LEAK', 'VANDALISM', 'SAFETY', 'OTHER');
CREATE TYPE "IncidentUrgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE "ImputationType" AS ENUM ('SYNDICATE_BUDGET', 'INSURANCE', 'LOT_OWNER', 'THIRD_PARTY');

ALTER TABLE "charge_calls" ADD COLUMN "batch_id" UUID;

CREATE TABLE "lot_owner_profiles" (
  "id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "contact_id" TEXT NOT NULL,
  "ownership_percentage" DECIMAL(5,2) NOT NULL,
  "owned_since" TIMESTAMP(3) NOT NULL,
  "owned_until" TIMESTAMP(3),
  "portal_access_enabled" BOOLEAN NOT NULL DEFAULT false,
  "portal_access_token" TEXT,
  "notification_prefs" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lot_owner_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lot_tenant_profiles" (
  "id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "contact_id" TEXT NOT NULL,
  "lease_id" TEXT,
  "tenant_since" TIMESTAMP(3) NOT NULL,
  "tenant_until" TIMESTAMP(3),
  "charges_billed_to_tenant" BOOLEAN NOT NULL DEFAULT false,
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lot_tenant_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "syndicate_budgets" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "fiscal_year" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "status" "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
  "approved_at" TIMESTAMP(3),
  "approved_by_resolution_id" UUID,
  "total_amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "syndicate_budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "charge_call_batches" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "batch_type" "BatchType" NOT NULL,
  "budget_id" UUID,
  "total_amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "status" "BatchStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "charge_call_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_methods" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "type" "PaymentType" NOT NULL,
  "provider" TEXT,
  "account_ref" TEXT,
  "label" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_reminders" (
  "id" UUID NOT NULL,
  "charge_call_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "reminder_level" INTEGER NOT NULL,
  "sent_at" TIMESTAMP(3) NOT NULL,
  "channel" "ReminderChannel" NOT NULL,
  "status" "ReminderStatus" NOT NULL,
  "response_action" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "late_payment_penalties" (
  "id" UUID NOT NULL,
  "charge_call_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "days_late" INTEGER NOT NULL,
  "penalty_rate" DECIMAL(6,3) NOT NULL,
  "penalty_amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "applied_at" TIMESTAMP(3) NOT NULL,
  "waived" BOOLEAN NOT NULL DEFAULT false,
  "waived_at" TIMESTAMP(3),
  "waived_reason" TEXT,
  "journal_entry_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "late_payment_penalties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_schedules" (
  "id" UUID NOT NULL,
  "charge_call_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "agreed_at" TIMESTAMP(3) NOT NULL,
  "total_amount" DECIMAL(12,2) NOT NULL,
  "status" "ScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_schedule_instalments" (
  "id" UUID NOT NULL,
  "schedule_id" UUID NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "paid_at" TIMESTAMP(3),
  "paid_amount" DECIMAL(12,2),
  "status" "InstalmentStatus" NOT NULL DEFAULT 'PENDING',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_schedule_instalments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reminder_configs" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "level" INTEGER NOT NULL,
  "delay_days" INTEGER NOT NULL,
  "channels" JSONB NOT NULL,
  "template_subject" TEXT NOT NULL,
  "template_body" TEXT NOT NULL,
  "auto_send" BOOLEAN NOT NULL DEFAULT true,
  "penalty_rate_monthly" DECIMAL(6,3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reminder_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chart_of_accounts" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "account_number" TEXT NOT NULL,
  "account_name" TEXT NOT NULL,
  "account_class" INTEGER NOT NULL,
  "account_type" "AccountType" NOT NULL,
  "is_auxiliary" BOOLEAN NOT NULL DEFAULT false,
  "parent_account_id" UUID,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounting_journals" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "journal_type" "JournalType" NOT NULL,
  "label" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "fiscal_year" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "accounting_journals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_entries" (
  "id" UUID NOT NULL,
  "journal_id" UUID NOT NULL,
  "entry_date" TIMESTAMP(3) NOT NULL,
  "reference" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "source_type" "SourceType" NOT NULL,
  "source_id" TEXT,
  "is_locked" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_entry_lines" (
  "id" UUID NOT NULL,
  "entry_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "lot_id" UUID,
  "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "label" TEXT NOT NULL,
  "is_lettered" BOOLEAN NOT NULL DEFAULT false,
  "letter_ref" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "journal_entry_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "budget_line_items" (
  "id" UUID NOT NULL,
  "budget_id" UUID NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount_forecast" DECIMAL(14,2) NOT NULL,
  "amount_actual" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "distribution_key" "DistributionKey" NOT NULL,
  "account_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "budget_line_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "budget_allocations" (
  "id" UUID NOT NULL,
  "budget_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "total_allocated" DECIMAL(14,2) NOT NULL,
  "breakdown" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "budget_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "owner_accounts" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "lot_id" UUID NOT NULL,
  "contact_id" TEXT NOT NULL,
  "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "last_updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "owner_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "owner_account_transactions" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "transaction_date" TIMESTAMP(3) NOT NULL,
  "type" "TransactionType" NOT NULL,
  "debit" DECIMAL(12,2),
  "credit" DECIMAL(12,2),
  "balance_after" DECIMAL(14,2) NOT NULL,
  "label" TEXT NOT NULL,
  "reference" TEXT,
  "source_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "owner_account_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "syndicate_incidents" (
  "id" UUID NOT NULL,
  "syndicate_id" UUID NOT NULL,
  "reported_by_contact_id" TEXT NOT NULL,
  "lot_id" UUID,
  "asset_id" UUID,
  "incident_type" "IncidentType" NOT NULL,
  "description" TEXT NOT NULL,
  "urgency" "IncidentUrgency" NOT NULL,
  "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
  "reported_at" TIMESTAMP(3) NOT NULL,
  "resolved_at" TIMESTAMP(3),
  "maintenance_work_order_id" TEXT,
  "provider_id" UUID,
  "photos" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "syndicate_incidents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incident_cost_imputations" (
  "id" UUID NOT NULL,
  "incident_id" UUID NOT NULL,
  "imputation_type" "ImputationType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'XOF',
  "budget_line_id" UUID,
  "lot_id" UUID,
  "contract_id" UUID,
  "journal_entry_id" UUID,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "incident_cost_imputations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "charge_calls_batch_id_idx" ON "charge_calls"("batch_id");

CREATE INDEX "lot_owner_profiles_lot_id_idx" ON "lot_owner_profiles"("lot_id");
CREATE INDEX "lot_owner_profiles_contact_id_idx" ON "lot_owner_profiles"("contact_id");
CREATE INDEX "lot_owner_profiles_lot_id_is_active_idx" ON "lot_owner_profiles"("lot_id", "is_active");

CREATE INDEX "lot_tenant_profiles_lot_id_idx" ON "lot_tenant_profiles"("lot_id");
CREATE INDEX "lot_tenant_profiles_contact_id_idx" ON "lot_tenant_profiles"("contact_id");
CREATE INDEX "lot_tenant_profiles_lot_id_is_current_idx" ON "lot_tenant_profiles"("lot_id", "is_current");

CREATE INDEX "charge_call_batches_syndicate_id_idx" ON "charge_call_batches"("syndicate_id");
CREATE INDEX "charge_call_batches_budget_id_idx" ON "charge_call_batches"("budget_id");
CREATE INDEX "charge_call_batches_status_idx" ON "charge_call_batches"("status");

CREATE INDEX "payment_methods_syndicate_id_idx" ON "payment_methods"("syndicate_id");
CREATE INDEX "payment_methods_syndicate_id_is_active_idx" ON "payment_methods"("syndicate_id", "is_active");

CREATE INDEX "payment_reminders_charge_call_id_idx" ON "payment_reminders"("charge_call_id");
CREATE INDEX "payment_reminders_lot_id_idx" ON "payment_reminders"("lot_id");
CREATE INDEX "payment_reminders_charge_call_id_reminder_level_idx" ON "payment_reminders"("charge_call_id", "reminder_level");

CREATE INDEX "late_payment_penalties_charge_call_id_idx" ON "late_payment_penalties"("charge_call_id");
CREATE INDEX "late_payment_penalties_lot_id_idx" ON "late_payment_penalties"("lot_id");

CREATE INDEX "payment_schedules_charge_call_id_idx" ON "payment_schedules"("charge_call_id");
CREATE INDEX "payment_schedules_lot_id_idx" ON "payment_schedules"("lot_id");
CREATE INDEX "payment_schedules_lot_id_status_idx" ON "payment_schedules"("lot_id", "status");

CREATE INDEX "payment_schedule_instalments_schedule_id_idx" ON "payment_schedule_instalments"("schedule_id");
CREATE INDEX "payment_schedule_instalments_schedule_id_status_idx" ON "payment_schedule_instalments"("schedule_id", "status");

CREATE UNIQUE INDEX "reminder_configs_syndicate_id_level_key" ON "reminder_configs"("syndicate_id", "level");
CREATE INDEX "reminder_configs_syndicate_id_idx" ON "reminder_configs"("syndicate_id");

CREATE INDEX "syndicate_budgets_syndicate_id_idx" ON "syndicate_budgets"("syndicate_id");
CREATE INDEX "syndicate_budgets_approved_by_resolution_id_idx" ON "syndicate_budgets"("approved_by_resolution_id");
CREATE INDEX "syndicate_budgets_syndicate_id_fiscal_year_idx" ON "syndicate_budgets"("syndicate_id", "fiscal_year");

CREATE INDEX "budget_line_items_budget_id_idx" ON "budget_line_items"("budget_id");
CREATE INDEX "budget_line_items_account_id_idx" ON "budget_line_items"("account_id");

CREATE INDEX "budget_allocations_budget_id_idx" ON "budget_allocations"("budget_id");
CREATE INDEX "budget_allocations_lot_id_idx" ON "budget_allocations"("lot_id");

CREATE INDEX "chart_of_accounts_syndicate_id_idx" ON "chart_of_accounts"("syndicate_id");
CREATE INDEX "chart_of_accounts_parent_account_id_idx" ON "chart_of_accounts"("parent_account_id");
CREATE UNIQUE INDEX "chart_of_accounts_syndicate_id_account_number_key" ON "chart_of_accounts"("syndicate_id", "account_number");

CREATE INDEX "accounting_journals_syndicate_id_idx" ON "accounting_journals"("syndicate_id");
CREATE INDEX "accounting_journals_syndicate_id_fiscal_year_idx" ON "accounting_journals"("syndicate_id", "fiscal_year");

CREATE INDEX "journal_entries_journal_id_idx" ON "journal_entries"("journal_id");
CREATE INDEX "journal_entries_entry_date_idx" ON "journal_entries"("entry_date");

CREATE INDEX "journal_entry_lines_entry_id_idx" ON "journal_entry_lines"("entry_id");
CREATE INDEX "journal_entry_lines_account_id_idx" ON "journal_entry_lines"("account_id");
CREATE INDEX "journal_entry_lines_lot_id_idx" ON "journal_entry_lines"("lot_id");

CREATE UNIQUE INDEX "owner_accounts_lot_id_key" ON "owner_accounts"("lot_id");
CREATE INDEX "owner_accounts_syndicate_id_idx" ON "owner_accounts"("syndicate_id");
CREATE INDEX "owner_accounts_contact_id_idx" ON "owner_accounts"("contact_id");

CREATE INDEX "owner_account_transactions_account_id_idx" ON "owner_account_transactions"("account_id");
CREATE INDEX "owner_account_transactions_transaction_date_idx" ON "owner_account_transactions"("transaction_date");

CREATE INDEX "syndicate_incidents_syndicate_id_idx" ON "syndicate_incidents"("syndicate_id");
CREATE INDEX "syndicate_incidents_lot_id_idx" ON "syndicate_incidents"("lot_id");
CREATE INDEX "syndicate_incidents_asset_id_idx" ON "syndicate_incidents"("asset_id");
CREATE INDEX "syndicate_incidents_provider_id_idx" ON "syndicate_incidents"("provider_id");
CREATE INDEX "syndicate_incidents_status_idx" ON "syndicate_incidents"("status");

CREATE INDEX "incident_cost_imputations_incident_id_idx" ON "incident_cost_imputations"("incident_id");
CREATE INDEX "incident_cost_imputations_lot_id_idx" ON "incident_cost_imputations"("lot_id");
CREATE INDEX "incident_cost_imputations_contract_id_idx" ON "incident_cost_imputations"("contract_id");
CREATE INDEX "incident_cost_imputations_budget_line_id_idx" ON "incident_cost_imputations"("budget_line_id");

ALTER TABLE "charge_calls"
  ADD CONSTRAINT "charge_calls_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "charge_call_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lot_owner_profiles"
  ADD CONSTRAINT "lot_owner_profiles_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lot_owner_profiles"
  ADD CONSTRAINT "lot_owner_profiles_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lot_tenant_profiles"
  ADD CONSTRAINT "lot_tenant_profiles_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lot_tenant_profiles"
  ADD CONSTRAINT "lot_tenant_profiles_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "syndicate_budgets"
  ADD CONSTRAINT "syndicate_budgets_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "syndicate_budgets"
  ADD CONSTRAINT "syndicate_budgets_approved_by_resolution_id_fkey" FOREIGN KEY ("approved_by_resolution_id") REFERENCES "gm_resolutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "charge_call_batches"
  ADD CONSTRAINT "charge_call_batches_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charge_call_batches"
  ADD CONSTRAINT "charge_call_batches_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "syndicate_budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_methods"
  ADD CONSTRAINT "payment_methods_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_reminders"
  ADD CONSTRAINT "payment_reminders_charge_call_id_fkey" FOREIGN KEY ("charge_call_id") REFERENCES "charge_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_reminders"
  ADD CONSTRAINT "payment_reminders_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "late_payment_penalties"
  ADD CONSTRAINT "late_payment_penalties_charge_call_id_fkey" FOREIGN KEY ("charge_call_id") REFERENCES "charge_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "late_payment_penalties"
  ADD CONSTRAINT "late_payment_penalties_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_schedules"
  ADD CONSTRAINT "payment_schedules_charge_call_id_fkey" FOREIGN KEY ("charge_call_id") REFERENCES "charge_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_schedules"
  ADD CONSTRAINT "payment_schedules_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_schedule_instalments"
  ADD CONSTRAINT "payment_schedule_instalments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "payment_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reminder_configs"
  ADD CONSTRAINT "reminder_configs_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chart_of_accounts"
  ADD CONSTRAINT "chart_of_accounts_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chart_of_accounts"
  ADD CONSTRAINT "chart_of_accounts_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "accounting_journals"
  ADD CONSTRAINT "accounting_journals_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "accounting_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "journal_entry_lines"
  ADD CONSTRAINT "journal_entry_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entry_lines"
  ADD CONSTRAINT "journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entry_lines"
  ADD CONSTRAINT "journal_entry_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "budget_line_items"
  ADD CONSTRAINT "budget_line_items_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "syndicate_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_line_items"
  ADD CONSTRAINT "budget_line_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "budget_allocations"
  ADD CONSTRAINT "budget_allocations_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "syndicate_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "budget_allocations"
  ADD CONSTRAINT "budget_allocations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "owner_accounts"
  ADD CONSTRAINT "owner_accounts_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_accounts"
  ADD CONSTRAINT "owner_accounts_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "owner_accounts"
  ADD CONSTRAINT "owner_accounts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "owner_account_transactions"
  ADD CONSTRAINT "owner_account_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "owner_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "syndicate_incidents"
  ADD CONSTRAINT "syndicate_incidents_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "syndicate_incidents"
  ADD CONSTRAINT "syndicate_incidents_reported_by_contact_id_fkey" FOREIGN KEY ("reported_by_contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "syndicate_incidents"
  ADD CONSTRAINT "syndicate_incidents_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "syndicate_incidents"
  ADD CONSTRAINT "syndicate_incidents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "common_area_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "syndicate_incidents"
  ADD CONSTRAINT "syndicate_incidents_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "service_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incident_cost_imputations"
  ADD CONSTRAINT "incident_cost_imputations_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "syndicate_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incident_cost_imputations"
  ADD CONSTRAINT "incident_cost_imputations_budget_line_id_fkey" FOREIGN KEY ("budget_line_id") REFERENCES "budget_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_cost_imputations"
  ADD CONSTRAINT "incident_cost_imputations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_cost_imputations"
  ADD CONSTRAINT "incident_cost_imputations_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "maintenance_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
