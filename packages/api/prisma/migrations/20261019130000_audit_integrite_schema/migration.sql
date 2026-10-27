-- Audit du 2026-10-19, lot S : integrite du schema (une seule migration).
--
-- Genere par `prisma migrate diff --from-schema-datamodel <ancien> --to-schema-datamodel
-- schema.prisma --script`, puis complete a la main (marques « MANUEL »). Aucune
-- suppression de colonne ni de table ; les seuls DROP sont des contraintes de cle
-- etrangere recreees dans la meme migration (Cascade -> Restrict) et l'ancien index
-- unique des mandats, remplace par un index partiel.
--
-- Contenu :
--   1. Cascade -> Restrict sur les relations financieres (OwnerAccount, ChargeCall,
--      ChargePayment, ThirdPartyAccount, ThirdPartyMovement, JournalEntryLine.account).
--   2. PropertyMandate : un seul mandat ACTIF par (bien, agence) (index unique partiel).
--   3. Consentements CRM : defaut false (les lignes existantes ne sont pas modifiees).
--   4. RentalPenalty.calculated_amount (+ remplissage de l'existant).
--   5. SalaryPayment.treasury_account_id (+ FK Restrict vers treasury_accounts).
--   6. Table job_locks (verrou des jobs cron, plateforme).
--   7. 26 index de cles etrangeres filtrees par les services (dont salary_payments).
--
-- ChargePayment.idempotency_key existe deja (UNIQUE, migration spec 042) : rien a ajouter.

-- DropForeignKey
ALTER TABLE "charge_calls" DROP CONSTRAINT "charge_calls_syndicate_id_fkey";

-- DropForeignKey
ALTER TABLE "charge_calls" DROP CONSTRAINT "charge_calls_lot_id_fkey";

-- DropForeignKey
ALTER TABLE "charge_payments" DROP CONSTRAINT "charge_payments_lot_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_entry_lines" DROP CONSTRAINT "journal_entry_lines_account_id_fkey";

-- DropForeignKey
ALTER TABLE "owner_accounts" DROP CONSTRAINT "owner_accounts_syndicate_id_fkey";

-- DropForeignKey
ALTER TABLE "owner_accounts" DROP CONSTRAINT "owner_accounts_lot_id_fkey";

-- DropForeignKey
ALTER TABLE "owner_accounts" DROP CONSTRAINT "owner_accounts_contact_id_fkey";

-- DropForeignKey
ALTER TABLE "third_party_accounts" DROP CONSTRAINT "third_party_accounts_tenant_client_id_fkey";

-- DropForeignKey
ALTER TABLE "third_party_movements" DROP CONSTRAINT "third_party_movements_account_id_fkey";

-- DropIndex
DROP INDEX "property_mandates_property_id_tenant_id_is_active_key";

-- CreateIndex (MANUEL : index unique partiel, non exprimable en Prisma)
-- Remplace property_mandates_property_id_tenant_id_is_active_key, qui interdisait aussi
-- deux mandats revoques pour un meme (bien, agence) : la 2e revocation levait P2002.
-- Prisma ne connait pas cet index : `migrate diff` le signalera toujours comme dérive
-- (meme cas que les index partiels des migrations 20260928090000, 20260929120000, etc.).
CREATE UNIQUE INDEX "property_mandates_active_property_tenant_key"
  ON "property_mandates"("property_id", "tenant_id")
  WHERE "is_active" = true;

-- AlterTable (defaut seulement : aucune ligne existante n'est modifiee)
ALTER TABLE "crm_contacts" ALTER COLUMN "consent_marketing" SET DEFAULT false,
ALTER COLUMN "consent_whatsapp" SET DEFAULT false,
ALTER COLUMN "consent_email" SET DEFAULT false;

-- AlterTable
ALTER TABLE "rental_penalties" ADD COLUMN     "calculated_amount" DECIMAL(12,2);

-- Backfill (MANUEL) : pour l'existant, le montant calcule initial est le montant courant.
UPDATE "rental_penalties" SET "calculated_amount" = "amount" WHERE "calculated_amount" IS NULL;

-- AlterTable
ALTER TABLE "salary_payments" ADD COLUMN     "treasury_account_id" UUID;

-- CreateTable
CREATE TABLE "job_locks" (
    "name" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "locked_until" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_locks_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "secure_links_created_by_user_id_idx" ON "secure_links"("created_by_user_id");

-- CreateIndex
CREATE INDEX "external_access_grants_owner_client_id_idx" ON "external_access_grants"("owner_client_id");

-- CreateIndex
CREATE INDEX "external_access_grant_properties_property_id_idx" ON "external_access_grant_properties"("property_id");

-- CreateIndex
CREATE INDEX "external_access_grant_documents_property_id_idx" ON "external_access_grant_documents"("property_id");

-- CreateIndex
CREATE INDEX "external_access_grant_documents_document_id_idx" ON "external_access_grant_documents"("document_id");

-- CreateIndex
CREATE INDEX "properties_partnership_id_idx" ON "properties"("partnership_id");

-- CreateIndex
CREATE INDEX "rental_leases_owner_client_id_idx" ON "rental_leases"("owner_client_id");

-- CreateIndex
CREATE INDEX "maintenance_tickets_tenant_contact_id_idx" ON "maintenance_tickets"("tenant_contact_id");

-- CreateIndex
CREATE INDEX "syndicate_lots_coowner_id_idx" ON "syndicate_lots"("coowner_id");

-- CreateIndex
CREATE INDEX "journal_entries_voided_by_entry_id_idx" ON "journal_entries"("voided_by_entry_id");

-- CreateIndex
CREATE INDEX "syndic_provider_invoices_provider_id_idx" ON "syndic_provider_invoices"("provider_id");

-- CreateIndex
CREATE INDEX "supplier_invoices_purchase_order_id_idx" ON "supplier_invoices"("purchase_order_id");

-- CreateIndex
CREATE INDEX "employees_third_party_account_id_idx" ON "employees"("third_party_account_id");

-- CreateIndex
CREATE INDEX "salary_payments_treasury_account_id_idx" ON "salary_payments"("treasury_account_id");

-- CreateIndex
CREATE INDEX "stock_movements_location_id_idx" ON "stock_movements"("location_id");

-- CreateIndex
CREATE INDEX "stock_movements_stock_count_id_idx" ON "stock_movements"("stock_count_id");

-- CreateIndex
CREATE INDEX "stock_count_lines_item_id_idx" ON "stock_count_lines"("item_id");

-- CreateIndex
CREATE INDEX "stock_whatsapp_registrations_user_id_idx" ON "stock_whatsapp_registrations"("user_id");

-- CreateIndex
CREATE INDEX "stock_whatsapp_sessions_location_id_idx" ON "stock_whatsapp_sessions"("location_id");

-- CreateIndex
CREATE INDEX "stock_whatsapp_sessions_registration_id_idx" ON "stock_whatsapp_sessions"("registration_id");

-- CreateIndex
CREATE INDEX "stock_whatsapp_sessions_site_id_idx" ON "stock_whatsapp_sessions"("site_id");

-- CreateIndex
CREATE INDEX "stock_field_captures_item_id_idx" ON "stock_field_captures"("item_id");

-- CreateIndex
CREATE INDEX "stock_field_captures_user_id_idx" ON "stock_field_captures"("user_id");

-- CreateIndex
CREATE INDEX "direct_debit_mandates_syndicate_id_idx" ON "direct_debit_mandates"("syndicate_id");

-- CreateIndex
CREATE INDEX "direct_debit_remittances_syndicate_id_idx" ON "direct_debit_remittances"("syndicate_id");

-- CreateIndex
CREATE INDEX "syndic_payment_proof_reads_syndicate_id_idx" ON "syndic_payment_proof_reads"("syndicate_id");

-- AddForeignKey
ALTER TABLE "charge_calls" ADD CONSTRAINT "charge_calls_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_calls" ADD CONSTRAINT "charge_calls_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_payments" ADD CONSTRAINT "charge_payments_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_accounts" ADD CONSTRAINT "owner_accounts_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_accounts" ADD CONSTRAINT "owner_accounts_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_accounts" ADD CONSTRAINT "owner_accounts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "third_party_accounts" ADD CONSTRAINT "third_party_accounts_tenant_client_id_fkey" FOREIGN KEY ("tenant_client_id") REFERENCES "tenant_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "third_party_movements" ADD CONSTRAINT "third_party_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "third_party_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_treasury_account_id_fkey" FOREIGN KEY ("treasury_account_id") REFERENCES "treasury_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

