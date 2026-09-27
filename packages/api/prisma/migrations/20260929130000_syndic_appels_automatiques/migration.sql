-- CreateEnum
CREATE TYPE "SyndicChargeFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SyndicChargeAmountSource" AS ENUM ('BUDGET', 'FIXED');

-- CreateEnum
CREATE TYPE "SyndicChargeScheduleRunStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "syndic_charge_schedules" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "syndicate_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "frequency" "SyndicChargeFrequency" NOT NULL,
    "issue_day" INTEGER NOT NULL,
    "due_offset_days" INTEGER NOT NULL,
    "amount_source" "SyndicChargeAmountSource" NOT NULL,
    "budget_id" UUID,
    "fixed_amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "next_run_at" TIMESTAMP(3),
    "last_run_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syndic_charge_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndic_charge_schedule_runs" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "schedule_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "period_label" TEXT NOT NULL,
    "status" "SyndicChargeScheduleRunStatus" NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'CRON',
    "batch_id" UUID,
    "calls_created" INTEGER NOT NULL DEFAULT 0,
    "calls_covered" INTEGER NOT NULL DEFAULT 0,
    "notifications_sent" INTEGER NOT NULL DEFAULT 0,
    "notifications_skipped" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "syndic_charge_schedule_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "syndic_charge_schedules_tenant_id_syndicate_id_idx" ON "syndic_charge_schedules"("tenant_id", "syndicate_id");

-- CreateIndex
CREATE INDEX "syndic_charge_schedules_active_next_run_at_idx" ON "syndic_charge_schedules"("active", "next_run_at");

-- CreateIndex
CREATE INDEX "syndic_charge_schedules_budget_id_idx" ON "syndic_charge_schedules"("budget_id");

-- CreateIndex
CREATE INDEX "syndic_charge_schedule_runs_tenant_id_idx" ON "syndic_charge_schedule_runs"("tenant_id");

-- CreateIndex
CREATE INDEX "syndic_charge_schedule_runs_batch_id_idx" ON "syndic_charge_schedule_runs"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "syndic_charge_schedule_runs_schedule_id_period_start_key" ON "syndic_charge_schedule_runs"("schedule_id", "period_start");

-- AddForeignKey
ALTER TABLE "syndic_charge_schedules" ADD CONSTRAINT "syndic_charge_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_charge_schedules" ADD CONSTRAINT "syndic_charge_schedules_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_charge_schedules" ADD CONSTRAINT "syndic_charge_schedules_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "syndicate_budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_charge_schedule_runs" ADD CONSTRAINT "syndic_charge_schedule_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_charge_schedule_runs" ADD CONSTRAINT "syndic_charge_schedule_runs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "syndic_charge_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syndic_charge_schedule_runs" ADD CONSTRAINT "syndic_charge_schedule_runs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "charge_call_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Garde-fous metier (hors schema Prisma) : jour d'emission valable tous les
-- mois (1 a 28), echeance jamais anterieure a l'emission, source du montant
-- coherente, date de fin posterieure au debut, declencheur connu.
ALTER TABLE "syndic_charge_schedules" ADD CONSTRAINT "syndic_charge_schedules_issue_day_check" CHECK ("issue_day" BETWEEN 1 AND 28);
ALTER TABLE "syndic_charge_schedules" ADD CONSTRAINT "syndic_charge_schedules_due_offset_check" CHECK ("due_offset_days" >= 0);
ALTER TABLE "syndic_charge_schedules" ADD CONSTRAINT "syndic_charge_schedules_fixed_amount_check" CHECK ("fixed_amount" IS NULL OR "fixed_amount" > 0);
ALTER TABLE "syndic_charge_schedules" ADD CONSTRAINT "syndic_charge_schedules_amount_source_check" CHECK (
    ("amount_source" = 'FIXED' AND "fixed_amount" IS NOT NULL AND "budget_id" IS NULL)
    OR ("amount_source" = 'BUDGET' AND "fixed_amount" IS NULL)
);
ALTER TABLE "syndic_charge_schedules" ADD CONSTRAINT "syndic_charge_schedules_end_date_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "syndic_charge_schedule_runs" ADD CONSTRAINT "syndic_charge_schedule_runs_trigger_check" CHECK ("trigger" IN ('CRON', 'MANUAL'));
