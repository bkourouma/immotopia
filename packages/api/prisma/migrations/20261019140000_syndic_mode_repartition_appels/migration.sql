-- Menu lot 2 : mode de repartition des appels de charges entre les lots
-- (tantiemes / par type de lot / equitable). Additif, sans perte : les lignes
-- existantes prennent SHARES (tantiemes), le comportement historique.

-- CreateEnum
CREATE TYPE "ChargeAllocationMethod" AS ENUM ('SHARES', 'BY_LOT_TYPE', 'EQUAL');

-- AlterTable
ALTER TABLE "syndic_charge_schedules"
  ADD COLUMN "allocation_method" "ChargeAllocationMethod" NOT NULL DEFAULT 'SHARES';

-- AlterTable
ALTER TABLE "charge_call_batches"
  ADD COLUMN "allocation_method" "ChargeAllocationMethod" NOT NULL DEFAULT 'SHARES';

-- AlterTable : bareme par type de lot de la copropriete (montant PAR LOT et par type).
ALTER TABLE "syndicates"
  ADD COLUMN "lot_type_rates" JSONB,
  ADD COLUMN "lot_type_rates_updated_at" TIMESTAMP(3),
  ADD COLUMN "lot_type_rates_updated_by_id" TEXT;
