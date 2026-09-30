-- BUG-2026-09-30-025 : le numero de lot est unique dans une copropriete, sans
-- egard a la casse ni aux espaces de bord. Migration additive (aucune colonne
-- retiree). Le modele Prisma ne sait pas exprimer un index sur expression :
-- l'index est pose ici en SQL brut, et la verification applicative
-- (`assertLotNumberAvailable`) donne le 409 lisible.

-- 1. Renumerotation deterministe des doublons existants : le plus ancien lot
--    (created_at, puis id) garde son numero, les suivants deviennent
--    « <numero>-DUP2 », « <numero>-DUP3 »... (a corriger ensuite par
--    l'agence). Aucune ligne n'est supprimee.
WITH ranked AS (
  SELECT
    "id",
    btrim("lot_number") AS trimmed,
    ROW_NUMBER() OVER (
      PARTITION BY "syndicate_id", lower(btrim("lot_number"))
      ORDER BY "created_at", "id"
    ) AS rn
  FROM "syndicate_lots"
)
UPDATE "syndicate_lots" AS l
SET "lot_number" = r.trimmed || '-DUP' || r.rn::text
FROM ranked AS r
WHERE l."id" = r."id" AND r.rn > 1;

-- 2. Index unique : echoue proprement (23505) si un numero renomme entre en
--    collision avec un numero existant ; corriger alors a la main les lots
--    concernes (« -DUPn ») puis relancer la migration.
CREATE UNIQUE INDEX "syndicate_lots_syndicate_lot_number_uniq"
  ON "syndicate_lots" ("syndicate_id", lower(btrim("lot_number")));
