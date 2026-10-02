-- Patrimoine (spec 032) : assurances, sinistres et carnet d'entretien.
-- Migration additive : types et tables nouveaux, aucune donnee existante touchee.

-- CreateEnum
CREATE TYPE "InsuranceCoverageType" AS ENUM ('MULTIRISK_HOME', 'MULTIRISK_BUILDING', 'OWNER_LIABILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "InsuranceClaimCause" AS ENUM ('WATER_DAMAGE', 'FIRE', 'THEFT', 'STRUCTURAL', 'STORM', 'OTHER');

-- CreateEnum
CREATE TYPE "InsuranceClaimStatus" AS ENUM ('DECLARED', 'INSURER_NOTIFIED', 'EXPERTISE', 'SETTLED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InsuranceClaimDocumentKind" AS ENUM ('PHOTO_BEFORE', 'PHOTO_AFTER', 'QUOTE', 'EXPERT_REPORT', 'INSURER_LETTER', 'INVOICE');

-- CreateEnum
CREATE TYPE "MaintenanceLogCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'AIR_CONDITIONING', 'GENERATOR', 'ROOF_WATERPROOFING', 'PAINTING', 'OTHER');

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "insurer" TEXT NOT NULL,
    "policy_number" TEXT NOT NULL,
    "coverage_type" "InsuranceCoverageType" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "annual_premium" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "notes" TEXT,
    "document_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_claims" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "policy_id" UUID NOT NULL,
    "ticket_id" UUID,
    "expense_id" UUID,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cause" "InsuranceClaimCause" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "InsuranceClaimStatus" NOT NULL DEFAULT 'DECLARED',
    "claimed_amount" DECIMAL(14,2) NOT NULL,
    "indemnified_amount" DECIMAL(14,2),
    "deductible" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "rejection_reason" TEXT,
    "insurer_notified_at" TIMESTAMP(3),
    "expertise_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_claim_documents" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "claim_id" UUID NOT NULL,
    "document_id" TEXT NOT NULL,
    "kind" "InsuranceClaimDocumentKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_claim_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_claim_status_history" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "claim_id" UUID NOT NULL,
    "from_status" "InsuranceClaimStatus",
    "to_status" "InsuranceClaimStatus" NOT NULL,
    "note" TEXT,
    "changed_by_user_id" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_claim_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_log_entries" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "category" "MaintenanceLogCategory" NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL,
    "vendor_id" UUID,
    "cost" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "description" TEXT NOT NULL,
    "next_due_date" TIMESTAMP(3),
    "warranty_end_date" TIMESTAMP(3),
    "document_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "insurance_policies_tenant_id_idx" ON "insurance_policies"("tenant_id");

-- CreateIndex
CREATE INDEX "insurance_policies_tenant_id_property_id_idx" ON "insurance_policies"("tenant_id", "property_id");

-- CreateIndex
CREATE INDEX "insurance_policies_tenant_id_end_date_idx" ON "insurance_policies"("tenant_id", "end_date");

-- CreateIndex
CREATE INDEX "insurance_claims_tenant_id_idx" ON "insurance_claims"("tenant_id");

-- CreateIndex
CREATE INDEX "insurance_claims_tenant_id_status_idx" ON "insurance_claims"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "insurance_claims_tenant_id_property_id_idx" ON "insurance_claims"("tenant_id", "property_id");

-- CreateIndex
CREATE INDEX "insurance_claims_policy_id_idx" ON "insurance_claims"("policy_id");

-- CreateIndex
CREATE INDEX "insurance_claim_documents_tenant_id_idx" ON "insurance_claim_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "insurance_claim_documents_document_id_idx" ON "insurance_claim_documents"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_claim_documents_claim_id_document_id_key" ON "insurance_claim_documents"("claim_id", "document_id");

-- CreateIndex
CREATE INDEX "insurance_claim_status_history_tenant_id_idx" ON "insurance_claim_status_history"("tenant_id");

-- CreateIndex
CREATE INDEX "insurance_claim_status_history_claim_id_changed_at_idx" ON "insurance_claim_status_history"("claim_id", "changed_at");

-- CreateIndex
CREATE INDEX "maintenance_log_entries_tenant_id_idx" ON "maintenance_log_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "maintenance_log_entries_tenant_id_property_id_performed_at_idx" ON "maintenance_log_entries"("tenant_id", "property_id", "performed_at");

-- CreateIndex
CREATE INDEX "maintenance_log_entries_tenant_id_next_due_date_idx" ON "maintenance_log_entries"("tenant_id", "next_due_date");

-- CreateIndex
CREATE INDEX "maintenance_log_entries_tenant_id_warranty_end_date_idx" ON "maintenance_log_entries"("tenant_id", "warranty_end_date");

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "property_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "insurance_policies"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "property_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claim_documents" ADD CONSTRAINT "insurance_claim_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claim_documents" ADD CONSTRAINT "insurance_claim_documents_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "insurance_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claim_documents" ADD CONSTRAINT "insurance_claim_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "property_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claim_status_history" ADD CONSTRAINT "insurance_claim_status_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_claim_status_history" ADD CONSTRAINT "insurance_claim_status_history_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "insurance_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_log_entries" ADD CONSTRAINT "maintenance_log_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_log_entries" ADD CONSTRAINT "maintenance_log_entries_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_log_entries" ADD CONSTRAINT "maintenance_log_entries_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "maintenance_vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_log_entries" ADD CONSTRAINT "maintenance_log_entries_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "property_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

