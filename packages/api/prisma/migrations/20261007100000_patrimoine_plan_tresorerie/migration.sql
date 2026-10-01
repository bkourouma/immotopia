-- Plan de tresorerie previsionnel (spec 030) : migration additive.
-- Les depenses existantes deviennent « ponctuelles » (DEFAULT 'ONE_OFF') sans
-- changer de sens ; le parametre de taxe fonciere n'a AUCUNE valeur par defaut.

-- CreateEnum
CREATE TYPE "ExpenseRecurrence" AS ENUM ('ONE_OFF', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- AlterTable
ALTER TABLE "property_expenses" ADD COLUMN     "recurrence" "ExpenseRecurrence" NOT NULL DEFAULT 'ONE_OFF',
ADD COLUMN     "recurrence_end_date" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "patrimony_cash_plan_settings" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_tax_due_month" INTEGER,
    "property_tax_due_day" INTEGER,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrimony_cash_plan_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patrimony_cash_plan_settings_tenant_id_key" ON "patrimony_cash_plan_settings"("tenant_id");

-- AddForeignKey
ALTER TABLE "patrimony_cash_plan_settings" ADD CONSTRAINT "patrimony_cash_plan_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les deux champs de la date d'exigibilite : tous deux nuls (non renseigne)
-- ou tous deux renseignes dans leurs bornes.
ALTER TABLE "patrimony_cash_plan_settings" ADD CONSTRAINT "patrimony_cash_plan_settings_tax_due_check" CHECK (
    ("property_tax_due_month" IS NULL AND "property_tax_due_day" IS NULL)
    OR (
        "property_tax_due_month" IS NOT NULL AND "property_tax_due_day" IS NOT NULL
        AND "property_tax_due_month" BETWEEN 1 AND 12 AND "property_tax_due_day" BETWEEN 1 AND 31
    )
);
