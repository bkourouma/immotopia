-- Fonds de copropriete : reprise de l'historique et solde d'ouverture.
--
-- 1. Si l'ancienne table existe (syndicate_fund_movements_legacy, mise a
--    l'ecart par 20260929145000_syndic_fonds_ancienne_table), ses mouvements
--    sont recopies dans le journal S6 :
--      - meme identifiant, meme sens, meme montant, meme libelle ;
--      - agence tiree de la copropriete du fonds ;
--      - date du mouvement (occurred_at) -> created_at, qui ordonne le journal ;
--      - type : OPENING -> OPENING, PAYMENT -> CHARGE_PAYMENT (source_id = le
--        paiement de charges), EXPENSE -> MANUAL_EXPENSE,
--        ADJUSTMENT -> MANUAL_ADJUSTMENT ;
--      - balance_after recalcule en cumul, dans l'ordre chronologique.
--    La table _legacy est conservee telle quelle, en archive.
-- 2. Un fonds SANS aucun mouvement mais avec un solde non nul (fonds cree
--    avec un solde initial, sans journal) recoit un mouvement d'ouverture egal
--    a son solde, date de sa creation.
-- 3. Un fonds AVEC des mouvements dont le solde differe de la somme de son
--    journal (solde initial pose avant le journal S6, ou ecart de l'ancien
--    journal) recoit un mouvement d'ouverture pour l'ecart, date juste avant
--    son premier mouvement. Chaque cas est signale par un NOTICE.
-- 4. Controles, sur les SEULS fonds repris de l'ancienne table : chaque
--    mouvement ancien est repris, et solde = somme signee du journal. Sinon la
--    migration echoue (et est annulee). Les autres fonds ne font jamais
--    echouer le deploiement.
--
-- Le solde des fonds (syndicate_funds.balance) n'est JAMAIS modifie ici.
-- Rejouee, la migration ne duplique rien (identifiants repris, ecart nul).

DO $$
DECLARE
  has_legacy BOOLEAN := to_regclass(format('%I.%I', current_schema(), 'syndicate_fund_movements_legacy')) IS NOT NULL;
  missing INTEGER;
  mismatch RECORD;
  gap_row RECORD;
BEGIN
  -- 1. Reprise de l'ancien journal.
  IF has_legacy THEN
    EXECUTE $sql$
      WITH legacy AS (
        SELECT l.*,
               CASE WHEN l.direction::text = 'CREDIT' THEN l.amount ELSE -l.amount END AS signed
          FROM syndicate_fund_movements_legacy l
      ),
      offsets AS (
        -- Ecart eventuel entre le solde et l'ancien journal : pose avant le
        -- premier mouvement (0 quand l'ancien journal etait coherent).
        SELECT f.id AS fund_id,
               f.balance
                 - COALESCE((SELECT SUM(signed) FROM legacy WHERE legacy.fund_id = f.id), 0)
                 - COALESCE((SELECT SUM(CASE WHEN m.direction = 'CREDIT' THEN m.amount ELSE -m.amount END)
                               FROM syndicate_fund_movements m
                              WHERE m.fund_id = f.id), 0) AS offset_amount
          FROM syndicate_funds f
         WHERE f.id IN (SELECT DISTINCT fund_id FROM legacy)
      )
      INSERT INTO syndicate_fund_movements
        (id, tenant_id, fund_id, direction, amount, balance_after, label, source_type, source_id, created_by_id, created_at)
      SELECT l.id,
             s.tenant_id,
             l.fund_id,
             l.direction::text::"SyndicFundMovementDirection",
             l.amount,
             o.offset_amount + SUM(l.signed) OVER (
               PARTITION BY l.fund_id ORDER BY l.occurred_at, l.created_at, l.id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
             ),
             l.label,
             (CASE l.type::text
                WHEN 'OPENING' THEN 'OPENING'
                WHEN 'PAYMENT' THEN 'CHARGE_PAYMENT'
                WHEN 'EXPENSE' THEN 'MANUAL_EXPENSE'
                ELSE 'MANUAL_ADJUSTMENT'
              END)::"SyndicFundMovementSource",
             l.charge_payment_id::text,
             NULL,
             l.occurred_at
        FROM legacy l
        JOIN syndicate_funds f ON f.id = l.fund_id
        JOIN syndicates s ON s.id = f.syndicate_id
        JOIN offsets o ON o.fund_id = l.fund_id
       WHERE NOT EXISTS (SELECT 1 FROM syndicate_fund_movements m WHERE m.id = l.id)
    $sql$;
  END IF;

  -- 2. Fonds sans aucun mouvement, solde non nul : ouverture = solde.
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

  -- 3. Fonds avec mouvements dont le journal ne couvre pas tout le solde :
  --    ouverture pour l'ecart, avant le premier mouvement.
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

  -- 4. Controles, limites aux fonds repris de l'ancienne table.
  IF has_legacy THEN
    EXECUTE $sql$
      SELECT COUNT(*) FROM syndicate_fund_movements_legacy l
       WHERE NOT EXISTS (SELECT 1 FROM syndicate_fund_movements m WHERE m.id = l.id)
    $sql$ INTO missing;
    IF missing > 0 THEN
      RAISE EXCEPTION 'Reprise des fonds : % mouvement(s) ancien(s) non repris', missing;
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
    GET DIAGNOSTICS missing = ROW_COUNT;
    IF missing > 0 THEN
      RAISE EXCEPTION 'Reprise des fonds : le fonds % a un solde % different de son journal %',
        mismatch.id, mismatch.balance, mismatch.journal;
    END IF;
  END IF;
END
$$;
