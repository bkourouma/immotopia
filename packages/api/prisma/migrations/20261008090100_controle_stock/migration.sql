-- Lot 040 (spec 040, data-model §5, migration 2) : controle du stock de chantier.
-- Generee SANS base par `prisma migrate diff --from-schema-datamodel <schema de
-- origin/main> --to-schema-datamodel prisma/schema.prisma --script` ; les
-- ALTER TYPE ... ADD VALUE produits par le diff sont dans la migration 1
-- (20261008090000_controle_stock_enums). Contraintes non exprimables en Prisma
-- ajoutees a la main en fin de fichier.
--
-- Additive : colonnes facultatives ou avec defaut (aucune reecriture de ligne
-- existante), DROP NOT NULL sans reecriture, tables neuves. Aucun rattrapage.

-- CreateEnum
CREATE TYPE "StockCountKind" AS ENUM ('REGULAR', 'OPENING', 'CLOSING');

-- CreateEnum
CREATE TYPE "StockReasonCode" AS ENUM ('BREAKAGE', 'DETERIORATION', 'COUNTING_ERROR', 'ENTRY_ERROR', 'UNIT_CONFUSION', 'UNRECORDED_ISSUE', 'UNRECORDED_RECEIPT', 'UNEXPLAINED_DISAPPEARANCE', 'OPENING_BALANCE', 'NON_CONFORMING', 'DAMAGED_ON_DELIVERY', 'EXCESS_DELIVERY', 'SITE_SUPPLY', 'RETURN_TO_WAREHOUSE', 'SITE_EVACUATION', 'REBALANCING', 'OTHER');

-- CreateEnum
CREATE TYPE "StockValuationSource" AS ENUM ('DECLARED', 'INVOICE_LINE', 'AVERAGE_COST', 'LAST_RECEIPT', 'NONE');

-- CreateEnum
CREATE TYPE "StockSlipKind" AS ENUM ('RECEIPT', 'ISSUE', 'COUNT_REPORT');

-- CreateEnum
CREATE TYPE "StockAttachmentTarget" AS ENUM ('MOVEMENT', 'SLIP', 'COUNT_LINE');

-- CreateEnum
CREATE TYPE "StockAttachmentPurpose" AS ENUM ('GOODS_PHOTO', 'DELIVERY_NOTE', 'SIGNED_SLIP', 'OTHER');

-- CreateEnum
CREATE TYPE "StockAlertKind" AS ENUM ('COUNT_VARIANCE', 'COUNT_LINE_SET_ASIDE', 'COUNT_CANCELLED', 'LARGE_ISSUE', 'LARGE_SCRAP', 'RECEIPT_REPEATED', 'RECEIPT_OVER_INVOICE', 'RECEIPT_UNVALUED', 'CASH_MATERIAL_PURCHASE', 'COUNT_SELF_VALIDATED');

-- CreateEnum
CREATE TYPE "StockAlertSeverity" AS ENUM ('INFO', 'WARNING');

-- CreateEnum
CREATE TYPE "StockAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED');

-- AlterTable
ALTER TABLE "stock_settings" ADD COLUMN     "backdating_limit_days" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "cash_material_alert_amount" DECIMAL(16,2) DEFAULT 100000,
ADD COLUMN     "controls_updated_at" TIMESTAMP(3),
ADD COLUMN     "controls_updated_by_user_id" TEXT,
ADD COLUMN     "count_variance_alert_amount" DECIMAL(16,2) DEFAULT 100000,
ADD COLUMN     "count_variance_alert_percent" DECIMAL(5,2) DEFAULT 5,
ADD COLUMN     "issue_alert_amount" DECIMAL(16,2) DEFAULT 500000,
ADD COLUMN     "material_cost_category_ids" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "require_taker" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "reason_code" "StockReasonCode",
ADD COLUMN     "slip_id" UUID,
ADD COLUMN     "supplier_credit_value" DECIMAL(16,2),
ADD COLUMN     "supplier_invoice_line_id" UUID,
ADD COLUMN     "taker_id" UUID,
ADD COLUMN     "valuation_source" "StockValuationSource";

-- AlterTable
ALTER TABLE "stock_counts" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "cancelled_by_user_id" TEXT,
ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "closed_by_user_id" TEXT,
ADD COLUMN     "counted_value" DECIMAL(16,2),
ADD COLUMN     "counter_user_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "kind" "StockCountKind" NOT NULL DEFAULT 'REGULAR',
ADD COLUMN     "self_validated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "self_validation_reason" TEXT,
ADD COLUMN     "set_aside_variance_value" DECIMAL(16,2),
ADD COLUMN     "variance_value_gross" DECIMAL(16,2),
ADD COLUMN     "variance_value_net" DECIMAL(16,2);

-- AlterTable
ALTER TABLE "stock_count_lines" ADD COLUMN     "counted_at_server" TIMESTAMP(3),
ADD COLUMN     "counted_blind" BOOLEAN,
ADD COLUMN     "counted_by_user_id" TEXT,
ADD COLUMN     "expected_captured_at" TIMESTAMP(3),
ADD COLUMN     "justified_at" TIMESTAMP(3),
ADD COLUMN     "justified_by_user_id" TEXT,
ADD COLUMN     "movements_since_capture" INTEGER,
ADD COLUMN     "reason_code" "StockReasonCode",
ADD COLUMN     "set_aside_at" TIMESTAMP(3),
ADD COLUMN     "set_aside_by_user_id" TEXT,
ADD COLUMN     "set_aside_reason" TEXT,
ADD COLUMN     "unit_cost_at_validation" DECIMAL(16,4),
ALTER COLUMN "counted_quantity" DROP NOT NULL;

-- CreateTable
CREATE TABLE "stock_takers" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "team_or_company" TEXT,
    "phone" TEXT,
    "employee_id" UUID,
    "contractor_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_takers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_slips" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" "StockSlipKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "document_date" TIMESTAMP(3) NOT NULL,
    "location_id" UUID NOT NULL,
    "site_id" UUID,
    "taker_id" UUID,
    "requested_by" TEXT,
    "supplier_invoice_id" UUID,
    "stock_count_id" UUID,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_attachments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "target_type" "StockAttachmentTarget" NOT NULL,
    "movement_id" UUID,
    "slip_id" UUID,
    "count_line_id" UUID,
    "purpose" "StockAttachmentPurpose" NOT NULL DEFAULT 'GOODS_PHOTO',
    "caption" TEXT,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "uploaded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),
    "removed_by_user_id" TEXT,
    "removal_reason" TEXT,

    CONSTRAINT "stock_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_alerts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" "StockAlertKind" NOT NULL,
    "severity" "StockAlertSeverity" NOT NULL,
    "status" "StockAlertStatus" NOT NULL DEFAULT 'OPEN',
    "dedupe_key" TEXT NOT NULL,
    "amount" DECIMAL(16,2),
    "threshold" DECIMAL(16,2),
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "site_id" UUID,
    "location_id" UUID,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "details" JSONB,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_claimed_at" TIMESTAMP(3),
    "email_sent_at" TIMESTAMP(3),
    "email_skipped_reason" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_user_id" TEXT,
    "acknowledge_note" TEXT,

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_client_requests" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_request_id" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "body_hash" CHAR(64) NOT NULL,
    "result_type" TEXT,
    "result_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_client_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_takers_tenant_id_is_active_idx" ON "stock_takers"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "stock_takers_tenant_id_normalized_name_idx" ON "stock_takers"("tenant_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "stock_slips_stock_count_id_key" ON "stock_slips"("stock_count_id");

-- CreateIndex
CREATE INDEX "stock_slips_tenant_id_kind_document_date_idx" ON "stock_slips"("tenant_id", "kind", "document_date");

-- CreateIndex
CREATE INDEX "stock_slips_supplier_invoice_id_idx" ON "stock_slips"("supplier_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_slips_tenant_id_kind_year_number_key" ON "stock_slips"("tenant_id", "kind", "year", "number");

-- CreateIndex
CREATE INDEX "stock_attachments_tenant_id_target_type_idx" ON "stock_attachments"("tenant_id", "target_type");

-- CreateIndex
CREATE INDEX "stock_attachments_movement_id_idx" ON "stock_attachments"("movement_id");

-- CreateIndex
CREATE INDEX "stock_attachments_slip_id_idx" ON "stock_attachments"("slip_id");

-- CreateIndex
CREATE INDEX "stock_attachments_count_line_id_idx" ON "stock_attachments"("count_line_id");

-- CreateIndex
CREATE INDEX "stock_alerts_tenant_id_status_raised_at_idx" ON "stock_alerts"("tenant_id", "status", "raised_at" DESC);

-- CreateIndex
CREATE INDEX "stock_alerts_email_sent_at_tenant_id_idx" ON "stock_alerts"("email_sent_at", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_alerts_tenant_id_dedupe_key_key" ON "stock_alerts"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "stock_client_requests_created_at_idx" ON "stock_client_requests"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_client_requests_tenant_id_client_request_id_key" ON "stock_client_requests"("tenant_id", "client_request_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_movement_date_created_at_id_idx" ON "stock_movements"("tenant_id", "movement_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_type_movement_date_idx" ON "stock_movements"("tenant_id", "type", "movement_date");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_created_by_user_id_idx" ON "stock_movements"("tenant_id", "created_by_user_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_taker_id_idx" ON "stock_movements"("tenant_id", "taker_id");

-- CreateIndex
CREATE INDEX "stock_movements_supplier_invoice_id_idx" ON "stock_movements"("supplier_invoice_id");

-- CreateIndex
CREATE INDEX "stock_movements_slip_id_idx" ON "stock_movements"("slip_id");

-- CreateIndex
CREATE INDEX "stock_counts_tenant_id_status_idx" ON "stock_counts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "stock_counts_tenant_id_validated_at_idx" ON "stock_counts"("tenant_id", "validated_at");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_taker_id_fkey" FOREIGN KEY ("taker_id") REFERENCES "stock_takers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_slip_id_fkey" FOREIGN KEY ("slip_id") REFERENCES "stock_slips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_supplier_invoice_line_id_fkey" FOREIGN KEY ("supplier_invoice_line_id") REFERENCES "supplier_invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_counted_by_user_id_fkey" FOREIGN KEY ("counted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_justified_by_user_id_fkey" FOREIGN KEY ("justified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_set_aside_by_user_id_fkey" FOREIGN KEY ("set_aside_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_takers" ADD CONSTRAINT "stock_takers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_takers" ADD CONSTRAINT "stock_takers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_takers" ADD CONSTRAINT "stock_takers_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_takers" ADD CONSTRAINT "stock_takers_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_slips" ADD CONSTRAINT "stock_slips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_slips" ADD CONSTRAINT "stock_slips_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_slips" ADD CONSTRAINT "stock_slips_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_slips" ADD CONSTRAINT "stock_slips_taker_id_fkey" FOREIGN KEY ("taker_id") REFERENCES "stock_takers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_slips" ADD CONSTRAINT "stock_slips_supplier_invoice_id_fkey" FOREIGN KEY ("supplier_invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_slips" ADD CONSTRAINT "stock_slips_stock_count_id_fkey" FOREIGN KEY ("stock_count_id") REFERENCES "stock_counts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_slips" ADD CONSTRAINT "stock_slips_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_attachments" ADD CONSTRAINT "stock_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_attachments" ADD CONSTRAINT "stock_attachments_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_attachments" ADD CONSTRAINT "stock_attachments_slip_id_fkey" FOREIGN KEY ("slip_id") REFERENCES "stock_slips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_attachments" ADD CONSTRAINT "stock_attachments_count_line_id_fkey" FOREIGN KEY ("count_line_id") REFERENCES "stock_count_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_attachments" ADD CONSTRAINT "stock_attachments_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_attachments" ADD CONSTRAINT "stock_attachments_removed_by_user_id_fkey" FOREIGN KEY ("removed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_acknowledged_by_user_id_fkey" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_client_requests" ADD CONSTRAINT "stock_client_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Contraintes ajoutees a la main (data-model §5), non exprimables en Prisma.
-- ---------------------------------------------------------------------------

-- Avant l'index d'unicite : aucun lieu ne doit porter deux inventaires en
-- brouillon (possible avant ce lot, par concurrence). Plutot que de choisir
-- lequel garder, la migration echoue avec un message explicite.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "stock_counts" WHERE "status" = 'DRAFT'
    GROUP BY "location_id" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Spec 040 : un lieu porte plusieurs inventaires en brouillon ; les resoudre avant migration.';
  END IF;
END $$;

-- A2 : un seul inventaire ouvert (en cours ou clos non valide) par lieu.
-- Remplace la seule lecture applicative (stock-inventaire.ts), qui laissait
-- passer deux ouvertures simultanees.
CREATE UNIQUE INDEX "stock_counts_one_open_per_location"
  ON "stock_counts" ("location_id")
  WHERE "status" IN ('DRAFT', 'COUNTED');

-- A7-R1 : un seul inventaire d'ouverture par lieu, hors abandon.
CREATE UNIQUE INDEX "stock_counts_one_opening_per_location"
  ON "stock_counts" ("location_id")
  WHERE "kind" = 'OPENING' AND "status" <> 'CANCELLED';

-- A6 : un rebut ou un retour fournisseur porte toujours un motif type. Ces deux
-- natures naissent avec ce lot : aucune ligne existante, contrainte VALIDE.
-- TRANSFER n'y figure PAS : les transferts deja en base n'ont pas de motif, et
-- une contrainte NOT VALID s'appliquerait quand meme a toute MISE A JOUR d'une
-- ancienne ligne (ex. SET NULL d'une cle etrangere a la suppression d'un objet
-- lie), qui echouerait. Le motif du transfert (A11) est garanti par le service.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_code_required"
  CHECK ("type" NOT IN ('SUPPLIER_RETURN', 'SCRAP') OR "reason_code" IS NOT NULL);

-- B2 : un preneur est lie a un employe OU a un tacheron, jamais aux deux.
ALTER TABLE "stock_takers" ADD CONSTRAINT "stock_takers_single_link"
  CHECK ("employee_id" IS NULL OR "contractor_id" IS NULL);

-- B5 : exactement une cible, coherente avec target_type.
ALTER TABLE "stock_attachments" ADD CONSTRAINT "stock_attachments_single_target"
  CHECK (
       ("target_type" = 'MOVEMENT'   AND "movement_id" IS NOT NULL AND "slip_id" IS NULL AND "count_line_id" IS NULL)
    OR ("target_type" = 'SLIP'       AND "slip_id" IS NOT NULL AND "movement_id" IS NULL AND "count_line_id" IS NULL)
    OR ("target_type" = 'COUNT_LINE' AND "count_line_id" IS NOT NULL AND "movement_id" IS NULL AND "slip_id" IS NULL)
  );

-- B5-R5 : une piece retiree n'a plus de fichier, mais garde son empreinte.
ALTER TABLE "stock_attachments" ADD CONSTRAINT "stock_attachments_removed_has_no_file"
  CHECK ("removed_at" IS NULL OR "file_url" IS NULL);
