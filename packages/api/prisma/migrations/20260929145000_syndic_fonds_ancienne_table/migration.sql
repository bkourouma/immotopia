-- Fonds de copropriete : mise a l'ecart de l'ANCIENNE table des mouvements.
--
-- Contexte : la production a recu le 25/09/2026 une migration hors branche
-- (20260927080000_mouvements_fonds_copropriete) qui a cree une table
-- "syndicate_fund_movements" d'une autre structure (colonnes "type",
-- "syndicate_id", "occurred_at", "charge_payment_id"). La migration S6
-- (20260929150000_syndic_factures_prestataires) cree une table du meme nom et
-- echoue donc sur cette base (« relation already exists »).
--
-- Cette migration passe AVANT S6. Si, et seulement si, la table existe avec
-- l'ancienne structure (colonne "type" de type "FundMovementType"), elle la
-- renomme en "syndicate_fund_movements_legacy" et renomme sa cle primaire, ses
-- cles etrangeres et ses index (suffixe _legacy) : tous les noms dont S6 a
-- besoin sont liberes. Les donnees ne bougent pas ; la reprise dans la table
-- S6 est faite plus loin (20260930091000_syndic_fonds_reprise). La table
-- _legacy est conservee en archive.
--
-- Sur une base neuve (CI, base de demonstration, shadow database), la table
-- n'existe pas encore : la migration ne fait rien. Rejouee, elle ne fait rien
-- non plus (la table ancienne n'existe plus sous ce nom).

DO $$
DECLARE
  obj RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'syndicate_fund_movements'
       AND column_name = 'type'
       AND udt_name = 'FundMovementType'
  ) THEN
    RAISE NOTICE 'syndicate_fund_movements : pas d''ancienne structure, rien a faire';
    RETURN;
  END IF;

  IF to_regclass(format('%I.%I', current_schema(), 'syndicate_fund_movements_legacy')) IS NOT NULL THEN
    RAISE EXCEPTION 'syndicate_fund_movements_legacy existe deja : situation inattendue, intervention manuelle requise';
  END IF;

  ALTER TABLE "syndicate_fund_movements" RENAME TO "syndicate_fund_movements_legacy";

  -- Contraintes (cle primaire, cles etrangeres) : nom d'origine + _legacy.
  FOR obj IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = format('%I.%I', current_schema(), 'syndicate_fund_movements_legacy')::regclass
       AND c.conname LIKE 'syndicate_fund_movements\_%'
       AND c.conname NOT LIKE '%\_legacy'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I',
      current_schema(),
      'syndicate_fund_movements_legacy',
      obj.conname,
      obj.conname || '_legacy'
    );
  END LOOP;

  -- Index restants (ceux qui ne portent pas une contrainte deja renommee).
  FOR obj IN
    SELECT i.relname
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
     WHERE x.indrelid = format('%I.%I', current_schema(), 'syndicate_fund_movements_legacy')::regclass
       AND i.relname LIKE 'syndicate_fund_movements\_%'
       AND i.relname NOT LIKE '%\_legacy'
  LOOP
    EXECUTE format('ALTER INDEX %I.%I RENAME TO %I', current_schema(), obj.relname, obj.relname || '_legacy');
  END LOOP;

  RAISE NOTICE 'syndicate_fund_movements (ancienne structure) renommee en syndicate_fund_movements_legacy';
END
$$;
