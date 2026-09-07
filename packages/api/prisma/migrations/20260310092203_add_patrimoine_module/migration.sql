-- CreateEnum
CREATE TYPE "ValuationMethod" AS ENUM ('MANUAL', 'MARKET_ESTIMATE', 'EXPERT_APPRAISAL');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'CLOSED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('PROPERTY_TAX', 'CONDO_FEES', 'INSURANCE', 'ROUTINE_MAINTENANCE', 'RENOVATION', 'MANAGEMENT_FEES', 'UTILITIES', 'OTHER');

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('DRAFT', 'SENT', 'PAID');

-- CreateEnum
CREATE TYPE "StatementItemType" AS ENUM ('RENT_COLLECTED', 'EXPENSE_DEDUCTED', 'MANAGEMENT_FEE', 'ADVANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkProgramStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PatrimonyDocType" AS ENUM ('TITLE_DEED', 'NOTARIAL_DEED', 'TAX_DOCUMENT', 'INSURANCE', 'TECHNICAL_DIAGNOSIS', 'FLOOR_PLAN', 'BUILDING_PERMIT', 'OTHER');

-- CreateTable
CREATE TABLE "asset_valuations" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "valuated_at" TIMESTAMP(3) NOT NULL,
    "estimated_value" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "acquisition_cost" DECIMAL(14,2),
    "acquisition_date" TIMESTAMP(3),
    "method" "ValuationMethod" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_valuations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_loans" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "lender" TEXT NOT NULL,
    "capital_amount" DECIMAL(14,2) NOT NULL,
    "remaining_capital" DECIMAL(14,2) NOT NULL,
    "interest_rate" DECIMAL(6,4) NOT NULL,
    "monthly_payment" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_expenses" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "is_capitalized" BOOLEAN NOT NULL DEFAULT false,
    "receipt_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_statements" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_contact_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "total_revenue" DECIMAL(14,2) NOT NULL,
    "total_expenses" DECIMAL(14,2) NOT NULL,
    "net_amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" "StatementStatus" NOT NULL DEFAULT 'DRAFT',
    "sent_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_statement_items" (
    "id" UUID NOT NULL,
    "statement_id" UUID NOT NULL,
    "property_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "StatementItemType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_statement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_programs" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimated_cost" DECIMAL(14,2) NOT NULL,
    "actual_cost" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "planned_date" TIMESTAMP(3) NOT NULL,
    "completed_date" TIMESTAMP(3),
    "status" "WorkProgramStatus" NOT NULL DEFAULT 'PLANNED',
    "is_capitalized" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrimony_documents" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT,
    "owner_contact_id" TEXT,
    "title" TEXT NOT NULL,
    "type" "PatrimonyDocType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrimony_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_valuations_tenant_id_idx" ON "asset_valuations"("tenant_id");

-- CreateIndex
CREATE INDEX "asset_valuations_property_id_idx" ON "asset_valuations"("property_id");

-- CreateIndex
CREATE INDEX "asset_valuations_tenant_id_property_id_valuated_at_idx" ON "asset_valuations"("tenant_id", "property_id", "valuated_at");

-- CreateIndex
CREATE INDEX "property_loans_tenant_id_idx" ON "property_loans"("tenant_id");

-- CreateIndex
CREATE INDEX "property_loans_property_id_idx" ON "property_loans"("property_id");

-- CreateIndex
CREATE INDEX "property_loans_tenant_id_property_id_status_idx" ON "property_loans"("tenant_id", "property_id", "status");

-- CreateIndex
CREATE INDEX "property_expenses_tenant_id_idx" ON "property_expenses"("tenant_id");

-- CreateIndex
CREATE INDEX "property_expenses_property_id_idx" ON "property_expenses"("property_id");

-- CreateIndex
CREATE INDEX "property_expenses_tenant_id_property_id_paid_at_idx" ON "property_expenses"("tenant_id", "property_id", "paid_at");

-- CreateIndex
CREATE INDEX "owner_statements_tenant_id_idx" ON "owner_statements"("tenant_id");

-- CreateIndex
CREATE INDEX "owner_statements_owner_contact_id_idx" ON "owner_statements"("owner_contact_id");

-- CreateIndex
CREATE INDEX "owner_statements_tenant_id_period_idx" ON "owner_statements"("tenant_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "owner_statements_tenant_id_owner_contact_id_period_key" ON "owner_statements"("tenant_id", "owner_contact_id", "period");

-- CreateIndex
CREATE INDEX "owner_statement_items_statement_id_idx" ON "owner_statement_items"("statement_id");

-- CreateIndex
CREATE INDEX "owner_statement_items_property_id_idx" ON "owner_statement_items"("property_id");

-- CreateIndex
CREATE INDEX "work_programs_tenant_id_idx" ON "work_programs"("tenant_id");

-- CreateIndex
CREATE INDEX "work_programs_property_id_idx" ON "work_programs"("property_id");

-- CreateIndex
CREATE INDEX "work_programs_tenant_id_property_id_status_idx" ON "work_programs"("tenant_id", "property_id", "status");

-- CreateIndex
CREATE INDEX "patrimony_documents_tenant_id_idx" ON "patrimony_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "patrimony_documents_property_id_idx" ON "patrimony_documents"("property_id");

-- CreateIndex
CREATE INDEX "patrimony_documents_owner_contact_id_idx" ON "patrimony_documents"("owner_contact_id");

-- CreateIndex
CREATE INDEX "patrimony_documents_tenant_id_expires_at_idx" ON "patrimony_documents"("tenant_id", "expires_at");

-- AddForeignKey
ALTER TABLE "asset_valuations" ADD CONSTRAINT "asset_valuations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_valuations" ADD CONSTRAINT "asset_valuations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_loans" ADD CONSTRAINT "property_loans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_loans" ADD CONSTRAINT "property_loans_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_expenses" ADD CONSTRAINT "property_expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_expenses" ADD CONSTRAINT "property_expenses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_statements" ADD CONSTRAINT "owner_statements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_statements" ADD CONSTRAINT "owner_statements_owner_contact_id_fkey" FOREIGN KEY ("owner_contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_statement_items" ADD CONSTRAINT "owner_statement_items_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "owner_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_statement_items" ADD CONSTRAINT "owner_statement_items_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_programs" ADD CONSTRAINT "work_programs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_programs" ADD CONSTRAINT "work_programs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrimony_documents" ADD CONSTRAINT "patrimony_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrimony_documents" ADD CONSTRAINT "patrimony_documents_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrimony_documents" ADD CONSTRAINT "patrimony_documents_owner_contact_id_fkey" FOREIGN KEY ("owner_contact_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
