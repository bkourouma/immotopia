-- Un seul modele par defaut par type de document, et non « un seul modele par
-- valeur de is_default ».
--
-- La contrainte precedente portait sur le triplet (tenant_id, doc_type,
-- is_default). Elle interdisait donc aussi deux modeles du meme type ayant tous
-- deux is_default = false : des qu'une agence possedait un second modele d'un
-- type, « Definir par defaut » echouait, parce que l'etape qui retire le defaut
-- a l'ancien creait mecaniquement deux lignes a false. Le changement de modele
-- par defaut etait donc impossible a partir du deuxieme modele.
--
-- Un index unique PARTIEL dit ce que la regle metier voulait dire : au plus une
-- ligne a is_default = true par (tenant_id, doc_type). Les lignes a false ne
-- sont pas contraintes, il peut y en avoir autant que voulu.
--
-- Cet index n'est pas exprimable dans schema.prisma (Prisma ne genere pas
-- d'index partiel sur PostgreSQL) : il vit ici. Si une future commande
-- `prisma migrate dev` propose de le supprimer, c'est ce manque d'expressivite
-- qui parle, pas un changement voulu — retirer la ligne de la migration generee.
ALTER TABLE "document_templates"
  DROP CONSTRAINT IF EXISTS "document_templates_tenant_id_doc_type_is_default_key";

DROP INDEX IF EXISTS "document_templates_tenant_id_doc_type_is_default_key";

-- Filet avant la creation de l'index : une base ou deux modeles du meme type
-- portent deja le defaut (cas produit par la suppression d'un modele par
-- defaut, qui promouvait un remplacant sans retirer le drapeau au supprime)
-- ferait echouer la creation. On ne garde que le plus recent.
UPDATE "document_templates" AS d
SET "is_default" = false
WHERE "is_default"
  AND EXISTS (
    SELECT 1
    FROM "document_templates" AS autre
    WHERE autre."is_default"
      AND autre."doc_type" = d."doc_type"
      AND autre."tenant_id" IS NOT DISTINCT FROM d."tenant_id"
      AND (autre."created_at", autre."id") > (d."created_at", d."id")
  );

CREATE UNIQUE INDEX "document_templates_one_default_per_doc_type"
  ON "document_templates" ("tenant_id", "doc_type")
  WHERE "is_default";
