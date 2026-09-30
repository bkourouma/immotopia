-- BUG-2026-09-30-059 : le nom d'un prestataire est unique dans l'agence, sans
-- egard a la casse ni aux espaces de bord (meme table pour les prestataires de
-- copropriete et de maintenance). Migration additive (aucune colonne retiree).
-- Le modele Prisma ne sait pas exprimer un index sur expression : l'index est
-- pose ici en SQL brut, et la verification applicative
-- (`assertProviderNameAvailable`) donne le 409 lisible.

-- 1. Renumerotation deterministe des doublons existants : le plus ancien
--    prestataire (created_at, puis id) garde son nom, les suivants deviennent
--    « <nom> (doublon 2) », « <nom> (doublon 3) »... (a renommer ensuite par
--    l'agence). Aucune ligne n'est supprimee : contrats, incidents et factures
--    restent rattaches au meme identifiant.
WITH ranked AS (
  SELECT
    "id",
    btrim("name") AS trimmed,
    ROW_NUMBER() OVER (
      PARTITION BY "tenant_id", lower(btrim("name"))
      ORDER BY "created_at", "id"
    ) AS rn
  FROM "service_providers"
)
UPDATE "service_providers" AS p
SET "name" = r.trimmed || ' (doublon ' || r.rn::text || ')'
FROM ranked AS r
WHERE p."id" = r."id" AND r.rn > 1;

-- 2. Index unique : echoue proprement (23505) si un nom renomme entre en
--    collision avec un nom existant ; corriger alors a la main les prestataires
--    concernes (« (doublon n) ») puis relancer la migration.
CREATE UNIQUE INDEX IF NOT EXISTS "service_providers_tenant_name_uniq"
  ON "service_providers" ("tenant_id", lower(btrim("name")));
