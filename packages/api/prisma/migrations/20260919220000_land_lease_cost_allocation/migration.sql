-- Le loyer d'un terrain entre enfin dans le cout du chantier.
--
-- LE DEFAUT. Le schema du sous-lot avait ete gele a moitie :
-- `ThirdPartyKind` portait deja LANDLORD, les comptes 486 et 613 etaient
-- semes, mais trois choses manquaient. Sans elles, la constatation mensuelle
-- ne pouvait produire AUCUNE imputation de chantier, et le loyer n'entrait
-- donc jamais dans le cout reel du chantier — ce qui vide le sous-lot de son
-- sens, puisque c'est exactement ce que le PRD demande.
--
-- Releve par l'agent du service dans sa rubrique d'hypotheses, apres
-- verification sur le client Prisma genere plutot que sur une impression.

-- ETAPE 1 : l'imputation de chantier connait la constatation de loyer.
--
-- Ajouter une valeur a un enum Postgres est non bloquant et sans effet sur
-- les lignes existantes.
ALTER TYPE "CostAllocationSourceType" ADD VALUE IF NOT EXISTS 'LAND_LEASE_ACCRUAL';

-- ETAPE 2 : le journal general distingue les pieces du lot 4.
--
-- Sans ces deux valeurs, chaque ecriture de bail portait `MANUAL` et le grand
-- livre perdait une distinction qu'il a pour toutes les autres pieces.
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'LAND_LEASE_PAYMENT';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'LAND_LEASE_ACCRUAL';

-- ETAPE 3 : le bail porte son poste de depense.
--
-- `CostAllocation.cost_category_id` est obligatoire : sans poste sur le bail,
-- la constatation ne pourrait rien imputer. La colonne est posee NOT NULL
-- directement, ce qui n'est possible que parce que la table est vide -- elle
-- a ete creee le meme jour, deux migrations plus tot, et aucun bail n'a
-- encore ete saisi. Un garde le verifie avant, plutot que de laisser la
-- migration echouer a moitie sur une base ou des baux existeraient.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "land_leases" LIMIT 1) THEN
    RAISE EXCEPTION
      'Des baux existent deja : ajouter cost_category_id en NOT NULL les casserait. Retro-remplir d abord.';
  END IF;
END $$;

ALTER TABLE "land_leases" ADD COLUMN "cost_category_id" UUID NOT NULL;

ALTER TABLE "land_leases"
  ADD CONSTRAINT "land_leases_cost_category_id_fkey"
  FOREIGN KEY ("cost_category_id") REFERENCES "cost_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
