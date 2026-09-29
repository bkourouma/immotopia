-- Patrimoine multi-actifs, lot 1 (ADR-005, specs/023-patrimoine-multi-actifs).
-- Migration additive : aucune ligne existante n'est réécrite ; seuls des actifs
-- REAL_ESTATE sont créés pour les biens qui portent déjà des données patrimoniales.

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('REAL_ESTATE', 'BUSINESS_EQUITY', 'INVENTORY', 'VEHICLE_EQUIPMENT', 'CASH', 'SAVINGS_INVESTMENT', 'RECEIVABLE', 'AGRICULTURE', 'MOVABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'DISPOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ValuationReliability" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "asset_valuations" ADD COLUMN     "asset_id" UUID,
ADD COLUMN     "reliability" "ValuationReliability",
ADD COLUMN     "source" TEXT,
ALTER COLUMN "property_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "patrimony_documents" ADD COLUMN     "asset_id" UUID;

-- AlterTable
ALTER TABLE "property_holdings" ADD COLUMN     "asset_id" UUID,
ALTER COLUMN "property_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "property_loans" ADD COLUMN     "asset_id" UUID,
ALTER COLUMN "property_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asset_class" "AssetClass" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "exchange_rate_to_xof" DECIMAL(18,6),
    "acquisition_cost" DECIMAL(14,2),
    "acquisition_date" TIMESTAMP(3),
    "disposed_at" TIMESTAMP(3),
    "holding_entity_id" UUID,
    "property_id" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "details_version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_property_id_key" ON "assets"("property_id");

-- CreateIndex
CREATE INDEX "assets_tenant_id_status_idx" ON "assets"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "assets_tenant_id_asset_class_idx" ON "assets"("tenant_id", "asset_class");

-- CreateIndex
CREATE INDEX "assets_holding_entity_id_idx" ON "assets"("holding_entity_id");

-- CreateIndex
CREATE INDEX "asset_valuations_asset_id_idx" ON "asset_valuations"("asset_id");

-- CreateIndex
CREATE INDEX "asset_valuations_tenant_id_asset_id_valuated_at_idx" ON "asset_valuations"("tenant_id", "asset_id", "valuated_at");

-- CreateIndex
CREATE INDEX "patrimony_documents_asset_id_idx" ON "patrimony_documents"("asset_id");

-- CreateIndex
CREATE INDEX "property_holdings_asset_id_idx" ON "property_holdings"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_holdings_asset_id_entity_id_key" ON "property_holdings"("asset_id", "entity_id");

-- CreateIndex
CREATE INDEX "property_loans_asset_id_idx" ON "property_loans"("asset_id");

-- CreateIndex
CREATE INDEX "property_loans_tenant_id_asset_id_status_idx" ON "property_loans"("tenant_id", "asset_id", "status");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_holding_entity_id_fkey" FOREIGN KEY ("holding_entity_id") REFERENCES "holding_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_valuations" ADD CONSTRAINT "asset_valuations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_loans" ADD CONSTRAINT "property_loans_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrimony_documents" ADD CONSTRAINT "patrimony_documents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_holdings" ADD CONSTRAINT "property_holdings_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Contraintes d'intégrité (non exprimables en Prisma).

-- Une valorisation ou une part détenue pointe sur EXACTEMENT un bien ou un actif.
ALTER TABLE "asset_valuations" ADD CONSTRAINT "asset_valuations_one_target_chk"
  CHECK (("property_id" IS NOT NULL AND "asset_id" IS NULL) OR ("property_id" IS NULL AND "asset_id" IS NOT NULL));

ALTER TABLE "property_holdings" ADD CONSTRAINT "property_holdings_one_target_chk"
  CHECK (("property_id" IS NOT NULL AND "asset_id" IS NULL) OR ("property_id" IS NULL AND "asset_id" IS NOT NULL));

-- Un prêt pointe sur AU PLUS un bien ou un actif (aucun = dette personnelle non adossée).
ALTER TABLE "property_loans" ADD CONSTRAINT "property_loans_at_most_one_target_chk"
  CHECK ("property_id" IS NULL OR "asset_id" IS NULL);

-- Seul un actif immobilier peut être adossé à un bien.
ALTER TABLE "assets" ADD CONSTRAINT "assets_property_only_real_estate_chk"
  CHECK ("asset_class" = 'REAL_ESTATE' OR "property_id" IS NULL);

-- Données : un actif REAL_ESTATE par bien qui porte des données patrimoniales
-- ou qui est un bien détenu en propre.
--
-- Critère « bien détenu » : celui de countHeldProperties()
-- (lot-registry-service.ts), c'est-à-dire une activation ouverte de nature
-- HELD_PROPERTY dans lot_activations (deactivated_at IS NULL).
--
-- Les biens sans tenant (properties.tenant_id IS NULL) sont IGNORÉS : un actif
-- exige un tenant. Ils n'ont pas de patrimoine consolidable par agence.
--
-- Idempotent : NOT EXISTS sur assets.property_id (unique).
INSERT INTO "assets" ("id", "tenant_id", "name", "asset_class", "status", "currency", "property_id", "details", "details_version", "created_at", "updated_at")
SELECT gen_random_uuid(), p."tenant_id", p."internal_reference", 'REAL_ESTATE', 'ACTIVE', 'XOF', p."id", '{}'::jsonb, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "properties" p
WHERE p."tenant_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "assets" a WHERE a."property_id" = p."id")
  AND (
    EXISTS (SELECT 1 FROM "asset_valuations" v WHERE v."property_id" = p."id")
    OR EXISTS (SELECT 1 FROM "property_loans" l WHERE l."property_id" = p."id")
    OR EXISTS (SELECT 1 FROM "property_holdings" h WHERE h."property_id" = p."id")
    OR EXISTS (SELECT 1 FROM "patrimony_documents" d WHERE d."property_id" = p."id")
    OR EXISTS (SELECT 1 FROM "lot_activations" la
               WHERE la."property_id" = p."id" AND la."kind" = 'HELD_PROPERTY' AND la."deactivated_at" IS NULL)
  );
