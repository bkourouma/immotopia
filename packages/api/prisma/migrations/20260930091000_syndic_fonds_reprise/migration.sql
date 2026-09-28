-- Fonds de copropriete : reprise de l'historique et solde d'ouverture.
--
-- 0. Coherence des affectations (toute base) : un appel de charges
--    (charge_calls.fund_id) ou un poste de budget (budget_line_items.fund_id,
--    copropriete lue sur syndicate_budgets) qui designe le fonds d'une AUTRE
--    copropriete fait echouer la migration. L'ancien code ecrivait ces
--    colonnes : a corriger a la main avant de redeployer.
-- 1. Si l'ancienne table existe (syndicate_fund_movements_legacy, mise a
--    l'ecart par 20260929145000_syndic_fonds_ancienne_table) :
--    a. controles prealables, qui font ECHOUER la migration :
--       - montant nul ou negatif (l'ancienne table porte un montant positif,
--         le sens est dans `direction`) ;
--       - type inconnu ;
--       - fonds repris dont le solde differe de la somme de son journal
--         (ancien journal + mouvements deja presents) : le message donne le
--         fonds, le solde et le journal. Aucun ecart n'est absorbe en silence.
--    b. recopie dans le journal S6. Correspondance avec l'ancienne structure
--       (migration 20260927080000_mouvements_fonds_copropriete) :
--         id                 -> id (meme identifiant)
--         direction          -> direction (CREDIT/DEBIT, meme libelle d'enum)
--         amount (> 0)       -> amount ; signe = direction
--         type               -> source_type : OPENING -> OPENING,
--                               PAYMENT -> CHARGE_PAYMENT, EXPENSE ->
--                               MANUAL_EXPENSE, ADJUSTMENT -> MANUAL_ADJUSTMENT
--         label              -> label
--         occurred_at        -> created_at (ordonne le journal)
--         charge_payment_id  -> source_id (texte ; NULL reste NULL)
--         syndicate_id       -> tenant_id via syndicates.tenant_id
--         (aucun auteur)     -> created_by_id NULL
--       balance_after = cumul signe, dans l'ordre chronologique.
--    La table _legacy est conservee telle quelle, en archive.
-- 2. Un fonds ABSENT de l'ancienne table, sans aucun mouvement et avec un
--    solde non nul, recoit un mouvement d'ouverture egal a son solde, date de
--    sa creation.
-- 3. Un fonds ABSENT de l'ancienne table qui a deja des mouvements S6 mais
--    un solde initial pose hors journal recoit une ouverture pour l'ecart,
--    datee juste avant son premier mouvement (NOTICE). Jamais pour un fonds
--    repris : son ecart a deja fait echouer l'etape 1a.
-- 4. Controles finaux sur les fonds repris : chaque mouvement ancien est
--    repris, et solde = somme signee du journal.
--
-- Le solde des fonds (syndicate_funds.balance) n'est JAMAIS modifie ici.

DO $$
DECLARE
  has_legacy BOOLEAN := to_regclass(format('%I.%I', current_schema(), 'syndicate_fund_movements_legacy')) IS NOT NULL;
  bad INTEGER;
  mismatch RECORD;
  gap_row RECORD;
BEGIN
  -- 0. Affectations vers le fonds d'une autre copropriete.
  SELECT COUNT(*) INTO bad
    FROM charge_calls c
    JOIN syndicate_funds f ON f.id = c.fund_id
   WHERE f.syndicate_id <> c.syndicate_id;
  IF bad > 0 THEN
    RAISE EXCEPTION 'Fonds : % appel(s) de charges affecte(s) au fonds d''une autre copropriete (charge_calls.fund_id) : a corriger avant la migration', bad;
  END IF;

  SELECT COUNT(*) INTO bad
    FROM budget_line_items l
    JOIN syndicate_budgets b ON b.id = l.budget_id
    JOIN syndicate_funds f ON f.id = l.fund_id
   WHERE f.syndicate_id <> b.syndicate_id;
  IF bad > 0 THEN
    RAISE EXCEPTION 'Fonds : % poste(s) de budget affecte(s) au fonds d''une autre copropriete (budget_line_items.fund_id) : a corriger avant la migration', bad;
  END IF;

  IF has_legacy THEN
    -- 1a. Controles prealables.
    EXECUTE 'SELECT COUNT(*) FROM syndicate_fund_movements_legacy WHERE amount <= 0' INTO bad;
    IF bad > 0 THEN
      RAISE EXCEPTION 'Reprise des fonds : % mouvement(s) ancien(s) de montant nul ou negatif', bad;
    END IF;

    EXECUTE $sql$
      SELECT COUNT(*) FROM syndicate_fund_movements_legacy
       WHERE type::text NOT IN ('OPENING', 'PAYMENT', 'EXPENSE', 'ADJUSTMENT')
          OR direction::text NOT IN ('CREDIT', 'DEBIT')
    $sql$ INTO bad;
    IF bad > 0 THEN
      RAISE EXCEPTION 'Reprise des fonds : % mouvement(s) ancien(s) de type ou de sens inconnu', bad;
    END IF;

    EXECUTE $sql$
      SELECT f.id, f.balance, j.journal
        FROM syndicate_funds f
        JOIN LATERAL (
          SELECT COALESCE((SELECT SUM(CASE WHEN l.direction::text = 'CREDIT' THEN l.amount ELSE -l.amount END)
                             FROM syndicate_fund_movements_legacy l WHERE l.fund_id = f.id), 0)
               + COALESCE((SELECT SUM(CASE WHEN m.direction = 'CREDIT' THEN m.amount ELSE -m.amount END)
                             FROM syndicate_fund_movements m
                            WHERE m.fund_id = f.id
                              AND NOT EXISTS (SELECT 1 FROM syndicate_fund_movements_legacy l2 WHERE l2.id = m.id)), 0)
                 AS journal
        ) j ON TRUE
       WHERE f.id IN (SELECT DISTINCT fund_id FROM syndicate_fund_movements_legacy)
         AND f.balance <> j.journal
       ORDER BY f.id
       LIMIT 1
    $sql$ INTO mismatch;
    GET DIAGNOSTICS bad = ROW_COUNT;
    IF bad > 0 THEN
      RAISE EXCEPTION 'Reprise des fonds : le fonds % a un solde % different de son journal repris % (ecart %) : a corriger avant la migration',
        mismatch.id, mismatch.balance, mismatch.journal, mismatch.balance - mismatch.journal;
    END IF;

    -- 1b. Recopie.
    EXECUTE $sql$
      WITH legacy AS (
        SELECT l.*,
               CASE WHEN l.direction::text = 'CREDIT' THEN l.amount ELSE -l.amount END AS signed
          FROM syndicate_fund_movements_legacy l
      )
      INSERT INTO syndicate_fund_movements
        (id, tenant_id, fund_id, direction, amount, balance_after, label, source_type, source_id, created_by_id, created_at)
      SELECT l.id,
             s.tenant_id,
             l.fund_id,
             l.direction::text::"SyndicFundMovementDirection",
             l.amount,
             SUM(l.signed) OVER (
               PARTITION BY l.fund_id ORDER BY l.occurred_at, l.created_at, l.id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ),
             l.label,
             (CASE l.type::text
                WHEN 'OPENING' THEN 'OPENING'
                WHEN 'PAYMENT' THEN 'CHARGE_PAYMENT'
                WHEN 'EXPENSE' THEN 'MANUAL_EXPENSE'
                WHEN 'ADJUSTMENT' THEN 'MANUAL_ADJUSTMENT'
              END)::"SyndicFundMovementSource",
             l.charge_payment_id::text,
             NULL,
             l.occurred_at
        FROM legacy l
        JOIN syndicate_funds f ON f.id = l.fund_id
        JOIN syndicates s ON s.id = f.syndicate_id
       WHERE NOT EXISTS (SELECT 1 FROM syndicate_fund_movements m WHERE m.id = l.id)
    $sql$;
  END IF;

  -- 2. Fonds absents de l'ancienne table, sans mouvement : ouverture = solde.
  --    (Sans ancienne table, tous les fonds sont « absents ».)
  INSERT INTO syndicate_fund_movements
    (id, tenant_id, fund_id, direction, amount, balance_after, label, source_type, source_id, created_by_id, created_at)
  SELECT gen_random_uuid(),
         s.tenant_id,
         f.id,
         (CASE WHEN f.balance >= 0 THEN 'CREDIT' ELSE 'DEBIT' END)::"SyndicFundMovementDirection",
         abs(f.balance),
         f.balance,
         'Solde repris',
         'OPENING'::"SyndicFundMovementSource",
         NULL,
         NULL,
         f.created_at
    FROM syndicate_funds f
    JOIN syndicates s ON s.id = f.syndicate_id
   WHERE f.balance <> 0
     AND NOT EXISTS (SELECT 1 FROM syndicate_fund_movements m WHERE m.fund_id = f.id);

  -- 3. Fonds absents de l'ancienne table, avec mouvements S6, solde initial
  --    hors journal : ouverture pour l'ecart, avant le premier mouvement.
  --    Un fonds repris a toujours un ecart nul ici (controle 1a).
  FOR gap_row IN
    SELECT f.id AS fund_id,
           s.tenant_id,
           g.gap,
           g.first_at
      FROM syndicate_funds f
      JOIN syndicates s ON s.id = f.syndicate_id
      JOIN LATERAL (
        SELECT f.balance - SUM(CASE WHEN m.direction = 'CREDIT' THEN m.amount ELSE -m.amount END) AS gap,
               MIN(m.created_at) AS first_at
          FROM syndicate_fund_movements m
         WHERE m.fund_id = f.id
      ) g ON g.first_at IS NOT NULL
     WHERE g.gap <> 0
  LOOP
    IF has_legacy THEN
      EXECUTE 'SELECT COUNT(*) FROM syndicate_fund_movements_legacy WHERE fund_id = $1' INTO bad USING gap_row.fund_id;
      IF bad > 0 THEN
        RAISE EXCEPTION 'Reprise des fonds : le fonds repris % garde un ecart de % apres reprise', gap_row.fund_id, gap_row.gap;
      END IF;
    END IF;
    INSERT INTO syndicate_fund_movements
      (id, tenant_id, fund_id, direction, amount, balance_after, label, source_type, source_id, created_by_id, created_at)
    VALUES (
      gen_random_uuid(),
      gap_row.tenant_id,
      gap_row.fund_id,
      (CASE WHEN gap_row.gap >= 0 THEN 'CREDIT' ELSE 'DEBIT' END)::"SyndicFundMovementDirection",
      abs(gap_row.gap),
      gap_row.gap,
      'Solde repris',
      'OPENING'::"SyndicFundMovementSource",
      NULL,
      NULL,
      gap_row.first_at - interval '1 millisecond'
    );
    RAISE NOTICE 'Fonds % : ouverture de % ajoutee pour aligner le journal sur le solde',
      gap_row.fund_id, gap_row.gap;
  END LOOP;

  -- 4. Controles finaux sur les fonds repris.
  IF has_legacy THEN
    EXECUTE $sql$
      SELECT COUNT(*) FROM syndicate_fund_movements_legacy l
       WHERE NOT EXISTS (SELECT 1 FROM syndicate_fund_movements m WHERE m.id = l.id)
    $sql$ INTO bad;
    IF bad > 0 THEN
      RAISE EXCEPTION 'Reprise des fonds : % mouvement(s) ancien(s) non repris', bad;
    END IF;

    EXECUTE $sql$
      SELECT f.id,
             f.balance,
             COALESCE(SUM(CASE WHEN m.direction = 'CREDIT' THEN m.amount ELSE -m.amount END), 0) AS journal
        FROM syndicate_funds f
        LEFT JOIN syndicate_fund_movements m ON m.fund_id = f.id
       WHERE f.id IN (SELECT DISTINCT fund_id FROM syndicate_fund_movements_legacy)
       GROUP BY f.id, f.balance
      HAVING f.balance <> COALESCE(SUM(CASE WHEN m.direction = 'CREDIT' THEN m.amount ELSE -m.amount END), 0)
       LIMIT 1
    $sql$ INTO mismatch;
    GET DIAGNOSTICS bad = ROW_COUNT;
    IF bad > 0 THEN
      RAISE EXCEPTION 'Reprise des fonds : le fonds % a un solde % different de son journal %',
        mismatch.id, mismatch.balance, mismatch.journal;
    END IF;
  END IF;
END
$$;
