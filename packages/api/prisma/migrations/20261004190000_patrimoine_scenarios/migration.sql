-- Patrimoine, lot 3 « projections et simulations » (specs/025-patrimoine-projections-simulations).
-- Migration additive : une enum et une table, aucune ligne existante n'est touchée.
-- La table ne stocke que des hypothèses et des opérations nommées, jamais un résultat de calcul.

-- CreateEnum
CREATE TYPE "ProjectionScenarioKey" AS ENUM ('PRUDENT', 'CENTRAL', 'OPTIMISTIC');

-- CreateTable
CREATE TABLE "patrimony_scenarios" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "horizon_years" INTEGER NOT NULL,
    "base_scenario" "ProjectionScenarioKey" NOT NULL DEFAULT 'CENTRAL',
    "assumptions" JSONB NOT NULL DEFAULT '{}',
    "operations" JSONB NOT NULL DEFAULT '[]',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrimony_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patrimony_scenarios_tenant_id_updated_at_idx" ON "patrimony_scenarios"("tenant_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "patrimony_scenarios_tenant_id_name_key" ON "patrimony_scenarios"("tenant_id", "name");

-- AddForeignKey
ALTER TABLE "patrimony_scenarios" ADD CONSTRAINT "patrimony_scenarios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Contraintes d'intégrité (non exprimables en Prisma).

-- Horizon de projection : 1 à 30 ans.
ALTER TABLE "patrimony_scenarios" ADD CONSTRAINT "patrimony_scenarios_horizon_years_chk"
  CHECK ("horizon_years" BETWEEN 1 AND 30);

-- Nom du scénario : 1 à 120 caractères.
ALTER TABLE "patrimony_scenarios" ADD CONSTRAINT "patrimony_scenarios_name_length_chk"
  CHECK (char_length("name") BETWEEN 1 AND 120);
