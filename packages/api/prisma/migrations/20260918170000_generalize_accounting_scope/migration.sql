-- Generalisation du moteur comptable — lot 2.
--
-- Prisma genere trois `ADD COLUMN tenant_id TEXT NOT NULL` sans valeur par
-- defaut, qui echouent des que la table n'est pas vide. La partie « portee »
-- a donc ete reecrite a la main, sur la sequence decrite au §1.3 de
-- specs/017-finance-fournisseurs-chantiers/data-model.md : colonne nullable,
-- retro-remplissage par jointure, controle, puis contrainte.
--
-- Deux controles arretent la migration avec un message lisible plutot que de
-- la laisser echouer a mi-parcours sur une erreur Postgres brute. Meme
-- principe defensif que la migration 20260907120000.
--
-- Chaque etape tolere un rejeu : `IF NOT EXISTS`, `IF EXISTS`, et des `UPDATE`
-- idempotents par construction.
--
-- Note d'honnetete : les tables comptables etaient VIDES sur la base de
-- demonstration au moment d'ecrire ceci. Le retro-remplissage et ses deux
-- controles n'ont donc pas ete exerces sur des donnees reelles. Ils comptent
-- pour une installation en production, ou ces tables sont peuplees.

-- CreateEnum
CREATE TYPE "AccountingScope" AS ENUM ('SYNDICATE', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "VoidableDocumentType" AS ENUM ('SUPPLIER_INVOICE', 'SUPPLIER_PAYMENT', 'CASH_VOUCHER');

-- CreateEnum
CREATE TYPE "SupplierKind" AS ENUM ('MATERIALS', 'SERVICES', 'MIXED');

-- CreateEnum
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('DRAFT', 'VALIDATED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ConstructionSiteStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CostAllocationSourceType" AS ENUM ('SUPPLIER_INVOICE', 'CASH_VOUCHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SourceType" ADD VALUE 'SUPPLIER_INVOICE';
ALTER TYPE "SourceType" ADD VALUE 'SUPPLIER_PAYMENT';
ALTER TYPE "SourceType" ADD VALUE 'CASH_VOUCHER';
ALTER TYPE "SourceType" ADD VALUE 'VOID';

-- ETAPE 1 — Controle prealable.
--
-- `Syndicate.tenantId` est obligatoire depuis l'origine du modele, donc ce
-- controle doit trouver zero ligne. Il reste ecrit : mieux vaut s'arreter ici,
-- avec un message clair, que d'echouer a l'etape 5 sur une contrainte.
DO $$
DECLARE orphelins INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphelins
    FROM "chart_of_accounts" c
    LEFT JOIN "syndicates" s ON s."id" = c."syndicate_id"
   WHERE s."id" IS NULL;
  IF orphelins > 0 THEN
    RAISE EXCEPTION 'Migration arretee : % plan(s) de comptes pointent vers une copropriete inexistante. Corriger ces lignes avant de rejouer.', orphelins;
  END IF;

  SELECT COUNT(*) INTO orphelins
    FROM "accounting_journals" j
    LEFT JOIN "syndicates" s ON s."id" = j."syndicate_id"
   WHERE s."id" IS NULL;
  IF orphelins > 0 THEN
    RAISE EXCEPTION 'Migration arretee : % journal(aux) pointent vers une copropriete inexistante. Corriger ces lignes avant de rejouer.', orphelins;
  END IF;
END $$;

-- ETAPE 2 — Colonnes ajoutees NULLABLES, pour que les lignes existantes
-- passent. `scope` recoit sa valeur par defaut : toutes les lignes actuelles
-- sont de copropriete.
ALTER TABLE "accounting_journals" ADD COLUMN IF NOT EXISTS "scope" "AccountingScope" NOT NULL DEFAULT 'SYNDICATE';
ALTER TABLE "accounting_journals" ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
ALTER TABLE "chart_of_accounts"   ADD COLUMN IF NOT EXISTS "scope" "AccountingScope" NOT NULL DEFAULT 'SYNDICATE';
ALTER TABLE "chart_of_accounts"   ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
ALTER TABLE "journal_entries"     ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;
ALTER TABLE "journal_entries"     ADD COLUMN IF NOT EXISTS "document_id" TEXT;
ALTER TABLE "journal_entries"     ADD COLUMN IF NOT EXISTS "document_type" TEXT;
ALTER TABLE "journal_entries"     ADD COLUMN IF NOT EXISTS "voided_by_entry_id" UUID;

-- ETAPE 3 — Retro-remplissage par jointure. L'ecriture remonte a son journal,
-- le journal a sa copropriete, la copropriete a son agence.
UPDATE "chart_of_accounts" c
   SET "tenant_id" = s."tenant_id"
  FROM "syndicates" s
 WHERE c."syndicate_id" = s."id" AND c."tenant_id" IS NULL;

UPDATE "accounting_journals" j
   SET "tenant_id" = s."tenant_id"
  FROM "syndicates" s
 WHERE j."syndicate_id" = s."id" AND j."tenant_id" IS NULL;

UPDATE "journal_entries" e
   SET "tenant_id" = s."tenant_id"
  FROM "accounting_journals" j
  JOIN "syndicates" s ON s."id" = j."syndicate_id"
 WHERE e."journal_id" = j."id" AND e."tenant_id" IS NULL;

-- ETAPE 4 — Controle post-remplissage.
DO $$
DECLARE restants INTEGER;
BEGIN
  SELECT (SELECT COUNT(*) FROM "chart_of_accounts"   WHERE "tenant_id" IS NULL)
       + (SELECT COUNT(*) FROM "accounting_journals" WHERE "tenant_id" IS NULL)
       + (SELECT COUNT(*) FROM "journal_entries"     WHERE "tenant_id" IS NULL)
    INTO restants;
  IF restants > 0 THEN
    RAISE EXCEPTION 'Migration arretee : % ligne(s) sans tenant_id apres retro-remplissage. La contrainte NOT NULL echouerait.', restants;
  END IF;
END $$;

-- ETAPE 5 — Les colonnes deviennent obligatoires, `syndicate_id` optionnelle.
ALTER TABLE "accounting_journals" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "accounting_journals" ALTER COLUMN "syndicate_id" DROP NOT NULL;
ALTER TABLE "chart_of_accounts"   ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "chart_of_accounts"   ALTER COLUMN "syndicate_id" DROP NOT NULL;
ALTER TABLE "journal_entries"     ALTER COLUMN "tenant_id" SET NOT NULL;

-- ETAPE 6 — L'ancienne unicite tombe.
--
-- Elle portait sur (syndicate_id, account_number). Avec un `syndicate_id`
-- devenu nullable, elle ne protegerait plus rien du cote operationnel :
-- Postgres considere deux NULL comme distincts, donc elle laisserait creer
-- autant de comptes « 401 » qu'on veut dans une meme agence.
ALTER TABLE "chart_of_accounts" DROP CONSTRAINT IF EXISTS "chart_of_accounts_syndicate_id_account_number_key";
DROP INDEX IF EXISTS "chart_of_accounts_syndicate_id_account_number_key";

-- ETAPE 7 — Deux index uniques PARTIELS la remplacent.
--
-- Ils ne peuvent pas etre declares dans le schema Prisma : son langage ne sait
-- pas exprimer une clause WHERE. Meme situation que `open_token` sur
-- newsletter_campaign_recipients, deja dans ce depot.
CREATE UNIQUE INDEX IF NOT EXISTS "chart_of_accounts_syndicate_account_number_key"
    ON "chart_of_accounts"("syndicate_id", "account_number")
 WHERE "syndicate_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "chart_of_accounts_tenant_account_number_key"
    ON "chart_of_accounts"("tenant_id", "account_number")
 WHERE "syndicate_id" IS NULL;

-- AlterTable
ALTER TABLE "journal_entry_lines" ALTER COLUMN "debit" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "credit" SET DATA TYPE DECIMAL(14,2);

-- AlterTable
ALTER TABLE "work_programs" ADD COLUMN     "construction_site_id" UUID;

-- CreateTable
CREATE TABLE "void_documents" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_type" "VoidableDocumentType" NOT NULL,
    "document_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "voided_by_user_id" TEXT NOT NULL,
    "voided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversing_entry_id" UUID,

    CONSTRAINT "void_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SupplierKind" NOT NULL,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "maintenance_vendor_id" UUID,
    "third_party_account_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "site_id" UUID,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "journal_entry_id" UUID,
    "created_by_user_id" TEXT NOT NULL,
    "validated_by_user_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoice_lines" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "method" TEXT NOT NULL,
    "journal_entry_id" UUID,
    "created_by_user_id" TEXT NOT NULL,
    "validated_by_user_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "construction_sites" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "property_id" TEXT,
    "land_lease_id" UUID,
    "manager_id" TEXT,
    "status" "ConstructionSiteStatus" NOT NULL DEFAULT 'PLANNED',
    "start_date" TIMESTAMP(3) NOT NULL,
    "planned_end_date" TIMESTAMP(3),
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMP(3),
    "final_cost" DECIMAL(14,2),
    "budget_threshold_percent" INTEGER,
    "stock_enabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "construction_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_categories" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "site_id" UUID NOT NULL,
    "cost_category_id" UUID NOT NULL,
    "source_type" "CostAllocationSourceType" NOT NULL,
    "source_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "validated_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_vouchers" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "voucher_number" INTEGER NOT NULL,
    "voucher_year" INTEGER NOT NULL,
    "site_id" UUID NOT NULL,
    "cost_category_id" UUID NOT NULL,
    "beneficiary_name" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "reason" TEXT NOT NULL,
    "voucher_date" TIMESTAMP(3) NOT NULL,
    "journal_entry_id" UUID,
    "created_by_user_id" TEXT NOT NULL,
    "validated_by_user_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "void_documents_tenant_id_idx" ON "void_documents"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "void_documents_document_type_document_id_key" ON "void_documents"("document_type", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_third_party_account_id_key" ON "suppliers"("third_party_account_id");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_idx" ON "suppliers"("tenant_id");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_is_active_idx" ON "suppliers"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "suppliers_maintenance_vendor_id_idx" ON "suppliers"("maintenance_vendor_id");

-- CreateIndex
CREATE INDEX "supplier_invoices_tenant_id_status_idx" ON "supplier_invoices"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "supplier_invoices_supplier_id_idx" ON "supplier_invoices"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_invoices_site_id_idx" ON "supplier_invoices"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_tenant_id_supplier_id_reference_key" ON "supplier_invoices"("tenant_id", "supplier_id", "reference");

-- CreateIndex
CREATE INDEX "supplier_invoice_lines_invoice_id_idx" ON "supplier_invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "supplier_payments_tenant_id_idx" ON "supplier_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "supplier_payments_supplier_id_idx" ON "supplier_payments"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_payment_id_idx" ON "supplier_payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_invoice_id_idx" ON "supplier_payment_allocations"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payment_allocations_payment_id_invoice_id_key" ON "supplier_payment_allocations"("payment_id", "invoice_id");

-- CreateIndex
CREATE INDEX "construction_sites_tenant_id_idx" ON "construction_sites"("tenant_id");

-- CreateIndex
CREATE INDEX "construction_sites_tenant_id_status_idx" ON "construction_sites"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "construction_sites_property_id_idx" ON "construction_sites"("property_id");

-- CreateIndex
CREATE INDEX "cost_categories_tenant_id_idx" ON "cost_categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_categories_tenant_id_label_key" ON "cost_categories"("tenant_id", "label");

-- CreateIndex
CREATE INDEX "cost_allocations_tenant_id_idx" ON "cost_allocations"("tenant_id");

-- CreateIndex
CREATE INDEX "cost_allocations_site_id_validated_at_idx" ON "cost_allocations"("site_id", "validated_at");

-- CreateIndex
CREATE INDEX "cost_allocations_source_type_source_id_idx" ON "cost_allocations"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "cash_vouchers_tenant_id_idx" ON "cash_vouchers"("tenant_id");

-- CreateIndex
CREATE INDEX "cash_vouchers_site_id_idx" ON "cash_vouchers"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_vouchers_tenant_id_voucher_year_voucher_number_key" ON "cash_vouchers"("tenant_id", "voucher_year", "voucher_number");

-- CreateIndex
CREATE INDEX "accounting_journals_tenant_id_idx" ON "accounting_journals"("tenant_id");

-- CreateIndex
CREATE INDEX "accounting_journals_tenant_id_scope_fiscal_year_idx" ON "accounting_journals"("tenant_id", "scope", "fiscal_year");

-- CreateIndex
CREATE INDEX "chart_of_accounts_tenant_id_idx" ON "chart_of_accounts"("tenant_id");

-- CreateIndex
CREATE INDEX "chart_of_accounts_tenant_id_scope_idx" ON "chart_of_accounts"("tenant_id", "scope");

-- CreateIndex
CREATE INDEX "journal_entries_tenant_id_idx" ON "journal_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "journal_entries_document_type_document_id_idx" ON "journal_entries"("document_type", "document_id");

-- CreateIndex
CREATE INDEX "work_programs_construction_site_id_idx" ON "work_programs"("construction_site_id");

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_journals" ADD CONSTRAINT "accounting_journals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_voided_by_entry_id_fkey" FOREIGN KEY ("voided_by_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_programs" ADD CONSTRAINT "work_programs_construction_site_id_fkey" FOREIGN KEY ("construction_site_id") REFERENCES "construction_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "void_documents" ADD CONSTRAINT "void_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "void_documents" ADD CONSTRAINT "void_documents_voided_by_user_id_fkey" FOREIGN KEY ("voided_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "void_documents" ADD CONSTRAINT "void_documents_reversing_entry_id_fkey" FOREIGN KEY ("reversing_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_maintenance_vendor_id_fkey" FOREIGN KEY ("maintenance_vendor_id") REFERENCES "maintenance_vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_third_party_account_id_fkey" FOREIGN KEY ("third_party_account_id") REFERENCES "third_party_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "construction_sites" ADD CONSTRAINT "construction_sites_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_categories" ADD CONSTRAINT "cost_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_allocations" ADD CONSTRAINT "cost_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_allocations" ADD CONSTRAINT "cost_allocations_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_allocations" ADD CONSTRAINT "cost_allocations_cost_category_id_fkey" FOREIGN KEY ("cost_category_id") REFERENCES "cost_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_vouchers" ADD CONSTRAINT "cash_vouchers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_vouchers" ADD CONSTRAINT "cash_vouchers_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_vouchers" ADD CONSTRAINT "cash_vouchers_cost_category_id_fkey" FOREIGN KEY ("cost_category_id") REFERENCES "cost_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_vouchers" ADD CONSTRAINT "cash_vouchers_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_vouchers" ADD CONSTRAINT "cash_vouchers_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_vouchers" ADD CONSTRAINT "cash_vouchers_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

