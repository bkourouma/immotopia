-- Correction de 20261006120000_syndic_lot_owner_from_profiles (laissee intacte) :
-- un profil proprietaire dont owned_since est dans le futur (vente en cours) ne
-- compte pas encore. Idempotente : ne touche que les lots dont le proprietaire
-- actuel est un contact present seulement via un profil futur.

-- 1. Lots ayant un profil ACTUEL : le proprietaire principal devient le profil
--    actuel de plus forte part (a part egale, le plus ancien).
UPDATE "syndicate_lots" AS l
SET "owner_contact_id" = p."contact_id",
    "coowner_id" = p."contact_id",
    "owner_since" = p."owned_since"
FROM (
  SELECT DISTINCT ON ("lot_id") "lot_id", "contact_id", "owned_since"
  FROM "lot_owner_profiles"
  WHERE "is_active" = true AND "owned_since" <= now()
    AND ("owned_until" IS NULL OR "owned_until" > now())
  ORDER BY "lot_id", "ownership_percentage" DESC, "owned_since" ASC, "id" ASC
) AS p
WHERE l."id" = p."lot_id"
  AND l."owner_contact_id" IS DISTINCT FROM p."contact_id"
  AND EXISTS (
    SELECT 1 FROM "lot_owner_profiles" f
    WHERE f."lot_id" = l."id" AND f."contact_id" = l."owner_contact_id"
      AND f."owned_since" > now()
  );

-- 2. Lots sans aucun profil actuel dont le proprietaire vient d'un profil futur : retire-le.
UPDATE "syndicate_lots" AS l
SET "owner_contact_id" = NULL, "coowner_id" = NULL, "owner_since" = NULL
WHERE l."owner_contact_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "lot_owner_profiles" f
    WHERE f."lot_id" = l."id" AND f."contact_id" = l."owner_contact_id" AND f."owned_since" > now()
  )
  AND NOT EXISTS (
    SELECT 1 FROM "lot_owner_profiles" c
    WHERE c."lot_id" = l."id" AND c."is_active" = true AND c."owned_since" <= now()
      AND (c."owned_until" IS NULL OR c."owned_until" > now())
  );
