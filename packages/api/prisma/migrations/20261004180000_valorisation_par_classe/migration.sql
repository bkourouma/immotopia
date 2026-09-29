-- Valorisation par classe d'actif et fiabilité, lot 2 (specs/024-patrimoine-valorisation-par-classe).
-- Migration additive : aucune ligne existante n'est réécrite. Les nouvelles valeurs
-- de ValuationMethod ne sont pas utilisées dans cette transaction (PostgreSQL 12+).

-- AlterEnum
ALTER TYPE "ValuationMethod" ADD VALUE IF NOT EXISTS 'DEPRECIATION_LINEAR';
ALTER TYPE "ValuationMethod" ADD VALUE IF NOT EXISTS 'DEPRECIATION_DECLINING';
ALTER TYPE "ValuationMethod" ADD VALUE IF NOT EXISTS 'EQUITY_SHARE';
ALTER TYPE "ValuationMethod" ADD VALUE IF NOT EXISTS 'UNIT_COST';
ALTER TYPE "ValuationMethod" ADD VALUE IF NOT EXISTS 'BALANCE';
ALTER TYPE "ValuationMethod" ADD VALUE IF NOT EXISTS 'ACCRUED_SAVINGS';
ALTER TYPE "ValuationMethod" ADD VALUE IF NOT EXISTS 'DISCOUNTED_CLAIM';
ALTER TYPE "ValuationMethod" ADD VALUE IF NOT EXISTS 'UNIT_VALUE';

-- AlterTable
ALTER TABLE "asset_valuations" ADD COLUMN     "reliability_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
