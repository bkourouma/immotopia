-- BUG-2026-09-30-087 : le proprietaire d'un lot (compte du lot, recouvrement,
-- liste des lots) se lit desormais depuis ses profils proprietaires actuels.
-- Rattrapage des lots qui ont un profil proprietaire actif mais pas de
-- proprietaire renseigne : le profil de plus forte part (a part egale, le plus
-- ancien) devient le proprietaire principal. Migration de donnees additive :
-- aucune colonne ni ligne supprimee, aucun proprietaire deja renseigne modifie.
UPDATE "syndicate_lots" AS l
SET "owner_contact_id" = p."contact_id",
    "coowner_id" = COALESCE(l."coowner_id", p."contact_id"),
    "owner_since" = COALESCE(l."owner_since", p."owned_since")
FROM (
  SELECT DISTINCT ON ("lot_id") "lot_id", "contact_id", "owned_since"
  FROM "lot_owner_profiles"
  WHERE "is_active" = true AND ("owned_until" IS NULL OR "owned_until" > now())
  ORDER BY "lot_id", "ownership_percentage" DESC, "owned_since" ASC, "id" ASC
) AS p
WHERE l."id" = p."lot_id"
  AND l."owner_contact_id" IS NULL
  AND l."coowner_id" IS NULL;
