-- Abonnements des agences par packs — vague 1 (docs/architecture/PLAN-ABONNEMENTS.md).
--
-- Migration ADDITIVE : aucune colonne ni table existante n'est supprimee.
-- `subscriptions.plan_key` devient facultatif (etiquette BASIC/PRO/ELITE
-- depreciee au profit des packs). Les tables du lot SMS (branche
-- feat/sms-lot-1, migration 20260927090000) ne sont PAS touchees ici.

-- CreateEnum
CREATE TYPE "CatalogItemKind" AS ENUM ('PACK', 'EXTENSION', 'SETUP');

-- CreateEnum
CREATE TYPE "CapacityKey" AS ENUM ('LOTS', 'COPROPRIETES', 'CHANTIERS');

-- CreateEnum
CREATE TYPE "SubscriptionItemStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "QuotaPolicy" AS ENUM ('BLOCK', 'BILL_OVERAGE', 'WARN_ONLY');

-- CreateEnum
CREATE TYPE "LotKind" AS ENUM ('RENTAL_UNIT', 'COPRO_LOT', 'PROGRAM_LOT');

-- CreateEnum
CREATE TYPE "InvoiceLineKind" AS ENUM ('PACK', 'EXTENSION', 'PRORATA', 'DISCOUNT', 'SETUP', 'OVERAGE', 'CREDIT', 'USAGE', 'TAX');

-- CreateEnum
CREATE TYPE "ModuleSource" AS ENUM ('PACK', 'OVERRIDE');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('PLATFORM', 'RENTAL');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "amount_excl_tax" DECIMAL(14,2),
ADD COLUMN     "kind" "InvoiceKind" NOT NULL DEFAULT 'PLATFORM',
ADD COLUMN     "period_end" TIMESTAMP(3),
ADD COLUMN     "period_start" TIMESTAMP(3),
ADD COLUMN     "tax_amount" DECIMAL(14,2),
ADD COLUMN     "tax_rate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "combo_discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 10,
ADD COLUMN     "grace_days" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "next_billing_at" TIMESTAMP(3),
ADD COLUMN     "past_due_at" TIMESTAMP(3),
ADD COLUMN     "quota_policy" "QuotaPolicy" NOT NULL DEFAULT 'BILL_OVERAGE',
ADD COLUMN     "trial_ends_at" TIMESTAMP(3),
ALTER COLUMN "plan_key" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tenant_modules" ADD COLUMN     "disabled_at" TIMESTAMP(3),
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "source" "ModuleSource" NOT NULL DEFAULT 'PACK';

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "CatalogItemKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthly_price" DECIMAL(14,2) NOT NULL,
    "setup_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "modules" "ModuleKey"[],
    "exclusive_group" TEXT,
    "rules" JSONB,
    "is_sellable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_capacities" (
    "id" TEXT NOT NULL,
    "catalog_item_id" TEXT NOT NULL,
    "capacity_key" "CapacityKey" NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "catalog_capacities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_items" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "catalog_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_monthly_price" DECIMAL(14,2) NOT NULL,
    "unit_setup_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "SubscriptionItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "end_reason" TEXT,
    "added_by_user_id" TEXT,
    "ended_by_user_id" TEXT,
    "replaces_item_id" TEXT,
    "billed_through" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacity_overrides" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "capacity_key" "CapacityKey" NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "granted_by_user_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capacity_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_activations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" "LotKind" NOT NULL,
    "unit_key" TEXT NOT NULL,
    "property_id" TEXT,
    "syndicate_lot_id" TEXT,
    "site_lot_id" TEXT,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_by_user_id" TEXT,
    "deactivated_at" TIMESTAMP(3),
    "deactivation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "tenant_id" TEXT NOT NULL,
    "kind" "InvoiceLineKind" NOT NULL,
    "label" TEXT NOT NULL,
    "catalog_item_id" TEXT,
    "subscription_item_id" TEXT,
    "capacity_key" "CapacityKey",
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_snapshots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "capacity_key" "CapacityKey" NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL,
    "limit" INTEGER NOT NULL,
    "overage" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_alerts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "capacity_key" "CapacityKey" NOT NULL,
    "threshold" INTEGER NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL,
    "limit" INTEGER NOT NULL,
    "notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_items_code_key" ON "catalog_items"("code");

-- CreateIndex
CREATE INDEX "catalog_items_kind_idx" ON "catalog_items"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_capacities_catalog_item_id_capacity_key_key" ON "catalog_capacities"("catalog_item_id", "capacity_key");

-- CreateIndex
CREATE INDEX "subscription_items_tenant_id_idx" ON "subscription_items"("tenant_id");

-- CreateIndex
CREATE INDEX "subscription_items_subscription_id_idx" ON "subscription_items"("subscription_id");

-- CreateIndex
CREATE INDEX "subscription_items_tenant_id_status_idx" ON "subscription_items"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "subscription_items_catalog_item_id_idx" ON "subscription_items"("catalog_item_id");

-- CreateIndex
CREATE INDEX "capacity_overrides_tenant_id_idx" ON "capacity_overrides"("tenant_id");

-- CreateIndex
CREATE INDEX "capacity_overrides_tenant_id_capacity_key_idx" ON "capacity_overrides"("tenant_id", "capacity_key");

-- CreateIndex
CREATE INDEX "lot_activations_tenant_id_deactivated_at_idx" ON "lot_activations"("tenant_id", "deactivated_at");

-- CreateIndex
CREATE INDEX "lot_activations_tenant_id_unit_key_idx" ON "lot_activations"("tenant_id", "unit_key");

-- CreateIndex
CREATE INDEX "lot_activations_property_id_idx" ON "lot_activations"("property_id");

-- CreateIndex
CREATE INDEX "lot_activations_syndicate_lot_id_idx" ON "lot_activations"("syndicate_lot_id");

-- CreateIndex
CREATE INDEX "lot_activations_site_lot_id_idx" ON "lot_activations"("site_lot_id");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_lines_tenant_id_invoice_id_idx" ON "invoice_lines"("tenant_id", "invoice_id");

-- CreateIndex
CREATE INDEX "invoice_lines_subscription_item_id_idx" ON "invoice_lines"("subscription_item_id");

-- CreateIndex
CREATE INDEX "usage_snapshots_tenant_id_period_start_idx" ON "usage_snapshots"("tenant_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "usage_snapshots_tenant_id_capacity_key_snapshot_date_key" ON "usage_snapshots"("tenant_id", "capacity_key", "snapshot_date");

-- CreateIndex
CREATE INDEX "quota_alerts_tenant_id_idx" ON "quota_alerts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "quota_alerts_tenant_id_capacity_key_threshold_period_start_key" ON "quota_alerts"("tenant_id", "capacity_key", "threshold", "period_start");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_kind_idx" ON "invoices"("tenant_id", "kind");

-- CreateIndex
CREATE INDEX "subscriptions_next_billing_at_idx" ON "subscriptions"("next_billing_at");

-- AddForeignKey
ALTER TABLE "catalog_capacities" ADD CONSTRAINT "catalog_capacities_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_catalog_item_id_fkey" FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity_overrides" ADD CONSTRAINT "capacity_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot_activations" ADD CONSTRAINT "lot_activations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_subscription_item_id_fkey" FOREIGN KEY ("subscription_item_id") REFERENCES "subscription_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_snapshots" ADD CONSTRAINT "usage_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quota_alerts" ADD CONSTRAINT "quota_alerts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Registre des lots : une seule activation OUVERTE par unite et par agence.
-- Index unique PARTIEL (non exprimable dans schema.prisma) : une unite
-- desactivee puis reactivee garde son historique.
CREATE UNIQUE INDEX "lot_activations_open_unit_key" ON "lot_activations"("tenant_id", "unit_key") WHERE "deactivated_at" IS NULL;

-- Une meme unite ne peut pas etre active deux fois ; le registre refuse aussi
-- une cle vide ou mal formee.
ALTER TABLE "lot_activations" ADD CONSTRAINT "lot_activations_unit_key_format" CHECK ("unit_key" ~ '^(P|SL|PL):.+$');

-- Essais en cours : la fin d'essai (D8) reprend la fin de periode actuelle.
UPDATE "subscriptions" SET "trial_ends_at" = "current_period_end"
WHERE "status" = 'TRIALING' AND "trial_ends_at" IS NULL;

-- Factures deja rattachees aux loyers : elles ne sont pas des factures de la
-- plateforme. Le lien RentalInstallment.invoice_id / RentalPayment.invoice_id
-- est conserve tel quel.
UPDATE "invoices" SET "kind" = 'RENTAL'
WHERE "id" IN (SELECT "invoice_id" FROM "rental_installments" WHERE "invoice_id" IS NOT NULL)
   OR "id" IN (SELECT "invoice_id" FROM "rental_payments" WHERE "invoice_id" IS NOT NULL);

-- Amorcage du catalogue : grille du site (lib/subscription/catalog.ts,
-- DEFAULT_CATALOG). Idempotent ; `npm run db:seed:catalog` realigne ensuite
-- les prix sur la meme source.
INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'AGENCE', 'PACK', 'Agence', 'Transaction et gestion locative — 100 logements sous mandat de gestion', 29900, 100000, ARRAY['MODULE_AGENCY']::"ModuleKey"[], NULL, NULL, true, 10, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'LOTS', 100 FROM "catalog_items" WHERE "code" = 'AGENCE'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'SYNDIC', 'PACK', 'Syndic', 'Cabinets de copropriété — 2 copropriétés actives et 100 lots principaux', 49900, 150000, ARRAY['MODULE_SYNDIC']::"ModuleKey"[], NULL, NULL, true, 20, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'COPROPRIETES', 2 FROM "catalog_items" WHERE "code" = 'SYNDIC'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'LOTS', 100 FROM "catalog_items" WHERE "code" = 'SYNDIC'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'PROMOTEUR', 'PACK', 'Promoteur', 'Promoteurs qui construisent et commercialisent — 2 chantiers actifs et 150 lots de programme', 149900, 450000, ARRAY['MODULE_PROMOTER']::"ModuleKey"[], NULL, NULL, true, 30, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'CHANTIERS', 2 FROM "catalog_items" WHERE "code" = 'PROMOTEUR'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'LOTS', 150 FROM "catalog_items" WHERE "code" = 'PROMOTEUR'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'INTEGRE', 'PACK', 'Opérateur intégré', 'Groupes qui construisent, vendent, louent et gèrent — 3 chantiers, 3 copropriétés et 300 lots distincts', 249900, 650000, ARRAY['MODULE_AGENCY', 'MODULE_SYNDIC', 'MODULE_PROMOTER']::"ModuleKey"[], 'INTEGRE', NULL, true, 40, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'CHANTIERS', 3 FROM "catalog_items" WHERE "code" = 'INTEGRE'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'COPROPRIETES', 3 FROM "catalog_items" WHERE "code" = 'INTEGRE'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'LOTS', 300 FROM "catalog_items" WHERE "code" = 'INTEGRE'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'EXT_LOTS_10', 'EXTENSION', 'Bloc de 10 lots', '150 FCFA le lot ; 100 FCFA avec Promoteur ou Intégré ; 75 FCFA pour l’Agence seule au-delà du 300e lot', 1500, 0, ARRAY[]::"ModuleKey"[], NULL, '{"lotTiers":[{"onlyPacks":["AGENCE"],"fromLot":301,"monthlyPrice":750}],"byHeldPacks":[{"anyOf":["PROMOTEUR","INTEGRE"],"monthlyPrice":1000}],"requiresAnyOf":["AGENCE","SYNDIC","PROMOTEUR","INTEGRE"]}'::jsonb, true, 110, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'LOTS', 10 FROM "catalog_items" WHERE "code" = 'EXT_LOTS_10'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'EXT_COPRO', 'EXTENSION', 'Copropriété supplémentaire', '+1 copropriété active', 10000, 0, ARRAY[]::"ModuleKey"[], NULL, '{"requiresAnyOf":["SYNDIC","INTEGRE"]}'::jsonb, true, 120, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'COPROPRIETES', 1 FROM "catalog_items" WHERE "code" = 'EXT_COPRO'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'EXT_CHANTIER', 'EXTENSION', 'Chantier supplémentaire', '+1 chantier actif ; 35 000 FCFA avec l’Intégré', 40000, 0, ARRAY[]::"ModuleKey"[], NULL, '{"byHeldPacks":[{"anyOf":["INTEGRE"],"monthlyPrice":35000}],"requiresAnyOf":["PROMOTEUR","INTEGRE"]}'::jsonb, true, 130, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'CHANTIERS', 1 FROM "catalog_items" WHERE "code" = 'EXT_CHANTIER'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'SETUP_AGENCE', 'SETUP', 'Mise en route accompagnée — Agence', 'Frais uniques, facultatifs', 0, 100000, ARRAY[]::"ModuleKey"[], NULL, '{"requiresAnyOf":["AGENCE"]}'::jsonb, true, 210, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'SETUP_SYNDIC', 'SETUP', 'Mise en route accompagnée — Syndic', 'Frais uniques, facultatifs', 0, 150000, ARRAY[]::"ModuleKey"[], NULL, '{"requiresAnyOf":["SYNDIC"]}'::jsonb, true, 220, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'SETUP_PROMOTEUR', 'SETUP', 'Mise en route accompagnée — Promoteur', 'Frais uniques, facultatifs', 0, 450000, ARRAY[]::"ModuleKey"[], NULL, '{"requiresAnyOf":["PROMOTEUR"]}'::jsonb, true, 230, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'SETUP_INTEGRE', 'SETUP', 'Mise en route accompagnée — Opérateur intégré', 'Frais uniques, facultatifs', 0, 650000, ARRAY[]::"ModuleKey"[], NULL, '{"requiresAnyOf":["INTEGRE"]}'::jsonb, true, 240, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
