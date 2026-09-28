-- Fonds de copropriete alimentes par les paiements de charges.
--
-- Regle (lib/syndics/fund-credits.ts) : un fonds est credite quand un
-- paiement de coproprietaire est affecte a un appel — en entier si l'appel
-- est affecte au fonds (charge_calls.fund_id), sinon pour la part des postes
-- de budget qui alimentent ce fonds (budget_line_items.fund_id), au prorata
-- de la repartition du lot.
--
-- La production porte deja les deux colonnes, leurs index et leurs cles
-- etrangeres (ancienne migration hors branche 20260927080000) : tout est
-- donc cree seulement s'il manque. Les noms sont ceux que Prisma genere,
-- identiques a ceux de l'ancienne migration.
--
-- Les nouvelles valeurs d'enum ne sont utilisees qu'a partir de la migration
-- suivante (20260930091000_syndic_fonds_reprise) : PostgreSQL refuse
-- d'employer une valeur ajoutee dans la meme transaction.

-- AlterEnum
ALTER TYPE "SyndicFundMovementSource" ADD VALUE IF NOT EXISTS 'OPENING';
ALTER TYPE "SyndicFundMovementSource" ADD VALUE IF NOT EXISTS 'CHARGE_PAYMENT';
ALTER TYPE "SyndicFundMovementSource" ADD VALUE IF NOT EXISTS 'MANUAL_EXPENSE';

-- AlterTable
ALTER TABLE "charge_calls" ADD COLUMN IF NOT EXISTS "fund_id" UUID;

-- AlterTable
ALTER TABLE "budget_line_items" ADD COLUMN IF NOT EXISTS "fund_id" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "charge_calls_fund_id_idx" ON "charge_calls"("fund_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "budget_line_items_fund_id_idx" ON "budget_line_items"("fund_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'charge_calls_fund_id_fkey') THEN
    ALTER TABLE "charge_calls" ADD CONSTRAINT "charge_calls_fund_id_fkey"
      FOREIGN KEY ("fund_id") REFERENCES "syndicate_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_line_items_fund_id_fkey') THEN
    ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_fund_id_fkey"
      FOREIGN KEY ("fund_id") REFERENCES "syndicate_funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
