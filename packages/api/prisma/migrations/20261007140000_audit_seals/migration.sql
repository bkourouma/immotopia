-- Scelles quotidiens du journal d'audit, chainage, et purge de retention bornee
-- (ADR-006, phase 5).

CREATE TABLE "audit_seals" (
  "id" TEXT NOT NULL,
  "seq" SERIAL NOT NULL,
  "seal_date" DATE NOT NULL,
  "tenant_key" TEXT NOT NULL,
  "visibility" "AuditVisibility" NOT NULL,
  "row_count" INTEGER NOT NULL,
  "root_hash" TEXT NOT NULL,
  "prev_hash" TEXT NOT NULL,
  "chain_hash" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL DEFAULT 'sha256-merkle-v1',
  "sealed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_seals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "audit_seals_seq_key" ON "audit_seals"("seq");
CREATE UNIQUE INDEX "audit_seals_seal_date_tenant_key_visibility_key"
  ON "audit_seals"("seal_date", "tenant_key", "visibility");
CREATE INDEX "audit_seals_seal_date_idx" ON "audit_seals"("seal_date");

-- Un scelle est definitif : jamais modifie, jamais supprime (un TRUNCATE reste
-- possible, comme pour audit_logs : remise a zero d'une base de recette).
CREATE OR REPLACE FUNCTION "audit_seals_block_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_seals est en ajout seul : % refuse', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_seals_immutable"
  BEFORE UPDATE OR DELETE ON "audit_seals"
  FOR EACH ROW EXECUTE FUNCTION "audit_seals_block_mutation"();

-- Purge de retention : le SEUL chemin applicatif qui supprime des lignes d'audit.
--
-- Trois garde-fous, pour qu'un bogue ou une mauvaise configuration ne puisse pas
-- effacer l'historique recent ou non scelle :
--   1. la date limite ne peut pas etre plus recente que 180 jours ;
--   2. une ligne n'est supprimee que si sa partition (jour UTC, agence,
--      visibilite) a un scelle : la racine de Merkle de ce qui a existe reste ;
--   3. suppression par lots (`batch_size`), pour ne pas bloquer la table.
-- Les dates de la base sont en UTC (colonnes sans fuseau, ecrites par Prisma).
CREATE OR REPLACE FUNCTION "audit_logs_purge"(
  "cutoff" TIMESTAMP,
  "target_visibility" "AuditVisibility",
  "batch_size" INTEGER
) RETURNS INTEGER AS $$
DECLARE
  deleted INTEGER;
BEGIN
  IF "cutoff" > (now() AT TIME ZONE 'UTC') - INTERVAL '180 days' THEN
    RAISE EXCEPTION 'audit_logs_purge : date limite trop recente (minimum 180 jours)';
  END IF;
  IF "batch_size" < 1 OR "batch_size" > 50000 THEN
    RAISE EXCEPTION 'audit_logs_purge : taille de lot invalide';
  END IF;

  PERFORM set_config('app.audit_purge', 'on', true);

  WITH doomed AS (
    SELECT l."id"
    FROM "audit_logs" l
    WHERE l."created_at" < "cutoff"
      AND l."visibility" = "target_visibility"
      AND EXISTS (
        SELECT 1 FROM "audit_seals" s
        WHERE s."seal_date" = l."created_at"::date
          AND s."tenant_key" = COALESCE(l."tenant_id", 'PLATFORM')
          AND s."visibility" = l."visibility"
      )
    ORDER BY l."created_at"
    LIMIT "batch_size"
  ),
  removed AS (
    DELETE FROM "audit_logs" WHERE "id" IN (SELECT "id" FROM doomed) RETURNING 1
  )
  SELECT count(*)::INTEGER INTO deleted FROM removed;

  PERFORM set_config('app.audit_purge', 'off', true);
  RETURN deleted;
END;
$$ LANGUAGE plpgsql;
