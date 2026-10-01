-- Patrimoine (spec 029) : hypotheses de projection enregistrees par bien.
-- Migration additive : une nouvelle table, aucune donnee existante touchee.

-- CreateTable
CREATE TABLE "property_yield_assumptions" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "years" INTEGER NOT NULL,
    "value_growth_rate" DECIMAL(7,4) NOT NULL,
    "rent_growth_rate" DECIMAL(7,4) NOT NULL,
    "expense_growth_rate" DECIMAL(7,4) NOT NULL,
    "vacancy_rate" DECIMAL(7,4) NOT NULL,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_yield_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_yield_assumptions_property_id_key" ON "property_yield_assumptions"("property_id");

-- CreateIndex
CREATE INDEX "property_yield_assumptions_tenant_id_idx" ON "property_yield_assumptions"("tenant_id");

-- AddForeignKey
ALTER TABLE "property_yield_assumptions" ADD CONSTRAINT "property_yield_assumptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_yield_assumptions" ADD CONSTRAINT "property_yield_assumptions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
