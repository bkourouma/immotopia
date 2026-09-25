-- Abonnements, vague 2 (lot B) : une extension est liee au pack avec lequel
-- elle a ete achetee, et se retire a la meme echeance que lui (decision de
-- Baba du 25/09). Migration additive : colonne nullable, index, cle etrangere.

ALTER TABLE "subscription_items" ADD COLUMN "parent_item_id" TEXT;

CREATE INDEX "subscription_items_parent_item_id_idx" ON "subscription_items"("parent_item_id");

ALTER TABLE "subscription_items"
  ADD CONSTRAINT "subscription_items_parent_item_id_fkey"
  FOREIGN KEY ("parent_item_id") REFERENCES "subscription_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reprise : les extensions existantes sont rattachees au plus ancien pack
-- ACTIF de leur abonnement qui les autorise (Syndic/Integre pour une
-- copropriete, Promoteur/Integre pour un chantier, n'importe quel pack pour
-- des lots).
UPDATE "subscription_items" AS ext
SET "parent_item_id" = (
  SELECT pack."id"
  FROM "subscription_items" AS pack
  JOIN "catalog_items" AS pc ON pc."id" = pack."catalog_item_id"
  WHERE pack."subscription_id" = ext."subscription_id"
    AND pc."kind" = 'PACK'
    AND pack."status" <> 'ENDED'
    AND (
      ec."code" NOT IN ('EXT_COPRO', 'EXT_CHANTIER')
      OR (ec."code" = 'EXT_COPRO' AND pc."code" IN ('SYNDIC', 'INTEGRE'))
      OR (ec."code" = 'EXT_CHANTIER' AND pc."code" IN ('PROMOTEUR', 'INTEGRE'))
    )
  ORDER BY pack."created_at" ASC
  LIMIT 1
)
FROM "catalog_items" AS ec
WHERE ec."id" = ext."catalog_item_id"
  AND ec."kind" = 'EXTENSION'
  AND ext."parent_item_id" IS NULL;
