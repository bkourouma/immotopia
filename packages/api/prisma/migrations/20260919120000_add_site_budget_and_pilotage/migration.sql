-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SiteBudgetStatus" AS ENUM ('DRAFT', 'VALIDATED');

-- AlterTable
ALTER TABLE "supplier_invoices" ADD COLUMN     "purchase_order_id" UUID;

-- CreateTable
CREATE TABLE "site_budgets" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "site_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "status" "SiteBudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "validated_at" TIMESTAMP(3),
    "validated_by_user_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_budget_lines" (
    "id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "cost_category_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount_forecast" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_amendments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "budget_id" UUID NOT NULL,
    "amendment_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SiteBudgetStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" TEXT NOT NULL,
    "validated_by_user_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_amendment_lines" (
    "id" UUID NOT NULL,
    "amendment_id" UUID NOT NULL,
    "cost_category_id" UUID NOT NULL,
    "amount_delta" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_amendment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "site_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "created_by_user_id" TEXT NOT NULL,
    "issued_by_user_id" TEXT,
    "issued_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "cost_category_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_progress_entries" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "site_id" UUID NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "percent" INTEGER NOT NULL,
    "note" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_progress_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_budget_alerts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "site_id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "threshold_percent" INTEGER NOT NULL,
    "engaged_amount" DECIMAL(14,2) NOT NULL,
    "budget_amount" DECIMAL(14,2) NOT NULL,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_user_id" TEXT,

    CONSTRAINT "site_budget_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_budgets_tenant_id_idx" ON "site_budgets"("tenant_id");

-- CreateIndex
CREATE INDEX "site_budgets_site_id_idx" ON "site_budgets"("site_id");

-- CreateIndex
CREATE INDEX "site_budget_lines_budget_id_idx" ON "site_budget_lines"("budget_id");

-- CreateIndex
CREATE INDEX "budget_amendments_tenant_id_idx" ON "budget_amendments"("tenant_id");

-- CreateIndex
CREATE INDEX "budget_amendments_budget_id_idx" ON "budget_amendments"("budget_id");

-- CreateIndex
CREATE INDEX "budget_amendment_lines_amendment_id_idx" ON "budget_amendment_lines"("amendment_id");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_idx" ON "purchase_orders"("tenant_id");

-- CreateIndex
CREATE INDEX "purchase_orders_site_id_idx" ON "purchase_orders"("site_id");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_reference_key" ON "purchase_orders"("tenant_id", "reference");

-- CreateIndex
CREATE INDEX "purchase_order_lines_order_id_idx" ON "purchase_order_lines"("order_id");

-- CreateIndex
CREATE INDEX "site_progress_entries_tenant_id_idx" ON "site_progress_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "site_progress_entries_site_id_entry_date_idx" ON "site_progress_entries"("site_id", "entry_date");

-- CreateIndex
CREATE INDEX "site_budget_alerts_tenant_id_idx" ON "site_budget_alerts"("tenant_id");

-- CreateIndex
CREATE INDEX "site_budget_alerts_site_id_idx" ON "site_budget_alerts"("site_id");

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_budgets" ADD CONSTRAINT "site_budgets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_budgets" ADD CONSTRAINT "site_budgets_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_budgets" ADD CONSTRAINT "site_budgets_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_budget_lines" ADD CONSTRAINT "site_budget_lines_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "site_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_budget_lines" ADD CONSTRAINT "site_budget_lines_cost_category_id_fkey" FOREIGN KEY ("cost_category_id") REFERENCES "cost_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_amendments" ADD CONSTRAINT "budget_amendments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_amendments" ADD CONSTRAINT "budget_amendments_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "site_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_amendments" ADD CONSTRAINT "budget_amendments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_amendments" ADD CONSTRAINT "budget_amendments_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_amendment_lines" ADD CONSTRAINT "budget_amendment_lines_amendment_id_fkey" FOREIGN KEY ("amendment_id") REFERENCES "budget_amendments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_amendment_lines" ADD CONSTRAINT "budget_amendment_lines_cost_category_id_fkey" FOREIGN KEY ("cost_category_id") REFERENCES "cost_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_cost_category_id_fkey" FOREIGN KEY ("cost_category_id") REFERENCES "cost_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_progress_entries" ADD CONSTRAINT "site_progress_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_progress_entries" ADD CONSTRAINT "site_progress_entries_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_progress_entries" ADD CONSTRAINT "site_progress_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_budget_alerts" ADD CONSTRAINT "site_budget_alerts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_budget_alerts" ADD CONSTRAINT "site_budget_alerts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "construction_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_budget_alerts" ADD CONSTRAINT "site_budget_alerts_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "site_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_budget_alerts" ADD CONSTRAINT "site_budget_alerts_acknowledged_by_user_id_fkey" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Un seul budget VALIDE par chantier.
--
-- C'est le budget initial au sens du PRD : celui contre lequel se lit l'ecart,
-- et que les avenants amendent. Les brouillons, eux, coexistent librement --
-- on prepare, on compare, on valide.
--
-- Index PARTIEL, que le langage de Prisma ne sait pas exprimer (il ne connait
-- pas la clause WHERE sur un index) : pose ici en SQL brut, comme au lot 2
-- pour le plan comptable generalise.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "site_budgets_one_validated_per_site"
  ON "site_budgets" ("site_id")
  WHERE "status" = 'VALIDATED';

-- ---------------------------------------------------------------------------
-- Une seule alerte NON ACQUITTEE par budget.
--
-- Sans cela, chaque piece validee au-dela du seuil en produirait une nouvelle,
-- et le tableau de bord se remplirait de la meme alerte repetee. La contrainte
-- porte la regle en base plutot que dans le seul service : une deuxieme voie
-- d'ecriture, un jour, ne pourra pas la contourner.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "site_budget_alerts_one_open_per_budget"
  ON "site_budget_alerts" ("budget_id")
  WHERE "acknowledged_at" IS NULL;
