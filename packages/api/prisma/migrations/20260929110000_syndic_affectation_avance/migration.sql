-- Lot S2 (plan Syndic, besoins 4 et 5) : periodes structurees, affectation
-- des paiements a plusieurs appels, avance du lot.
--
-- 1. DDL (genere par `prisma migrate diff`, ajuste pour `lot_id` qui est
--    rempli depuis l'appel AVANT de devenir obligatoire).
-- 2. Rattrapage idempotent : bornes des periodes, lot des paiements,
--    une affectation 1:1 par paiement existant, statuts recalcules.

-- CreateEnum
CREATE TYPE "ChargeAllocationSource" AS ENUM ('PAYMENT', 'ADVANCE');

-- DropForeignKey
ALTER TABLE "charge_payments" DROP CONSTRAINT "charge_payments_charge_call_id_fkey";

-- AlterTable
ALTER TABLE "charge_calls" ADD COLUMN     "period_end" DATE,
ADD COLUMN     "period_start" DATE;

-- AlterTable : `lot_id` est ajoute nullable, rempli plus bas, puis rendu obligatoire.
ALTER TABLE "charge_payments" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "lot_id" UUID,
ADD COLUMN     "unallocated_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ALTER COLUMN "charge_call_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "charge_call_batches" ADD COLUMN     "period_end" DATE,
ADD COLUMN     "period_start" DATE;

-- CreateTable
CREATE TABLE "charge_payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "charge_call_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "source" "ChargeAllocationSource" NOT NULL DEFAULT 'PAYMENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "charge_payment_allocations_charge_call_id_idx" ON "charge_payment_allocations"("charge_call_id");

-- CreateIndex
CREATE UNIQUE INDEX "charge_payment_allocations_payment_id_charge_call_id_key" ON "charge_payment_allocations"("payment_id", "charge_call_id");

-- ---------------------------------------------------------------------------
-- Rattrapage : lot de chaque paiement (tous les paiements existants ont un
-- appel, `charge_call_id` etait obligatoire jusqu'ici).
-- ---------------------------------------------------------------------------
UPDATE "charge_payments" p
SET "lot_id" = c."lot_id"
FROM "charge_calls" c
WHERE p."charge_call_id" = c."id"
  AND p."lot_id" IS NULL;

ALTER TABLE "charge_payments" ALTER COLUMN "lot_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "charge_payments_lot_id_paid_at_idx" ON "charge_payments"("lot_id", "paid_at");

-- AddForeignKey
ALTER TABLE "charge_payments" ADD CONSTRAINT "charge_payments_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_payments" ADD CONSTRAINT "charge_payments_charge_call_id_fkey" FOREIGN KEY ("charge_call_id") REFERENCES "charge_calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_payment_allocations" ADD CONSTRAINT "charge_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "charge_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge_payment_allocations" ADD CONSTRAINT "charge_payment_allocations_charge_call_id_fkey" FOREIGN KEY ("charge_call_id") REFERENCES "charge_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Rattrapage : une affectation 1:1 par paiement existant (source PAYMENT,
-- montant integral). L'identifiant de l'affectation reprend celui du
-- paiement : la liste `payments` reconstituee par l'API pour un appel garde
-- ainsi les memes identifiants qu'avant la migration. Le trop-percu etait
-- refuse jusqu'ici : aucun paiement existant ne depasse son appel, d'ou
-- `unallocated_amount = 0` (valeur par defaut).
-- ---------------------------------------------------------------------------
INSERT INTO "charge_payment_allocations" ("id", "payment_id", "charge_call_id", "amount", "source", "created_at")
SELECT p."id", p."id", p."charge_call_id", p."amount", 'PAYMENT', p."created_at"
FROM "charge_payments" p
WHERE p."charge_call_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "charge_payment_allocations" a WHERE a."payment_id" = p."id"
  )
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Rattrapage : bornes des periodes a partir du libelle libre.
--
-- Formats reconnus (identiques a `parsePeriodBounds`, lib/syndics/period.ts ;
-- annee de 1000 a 9999) :
--   « AAAA-MM-JJ au AAAA-MM-JJ »  bornes explicites (debut <= fin)
--   « AAAA-MM »                   mois entier
--   « AAAA-Qn » / « AAAA-Tn »     trimestre n (1 a 4)
--   « AAAA »                      annee entiere
-- Un suffixe de recurrence « -R1 » est ignore (premiere occurrence) ; « -R2 »
-- et suivants restent NULL : le decalage depend de la frequence, qui n'est pas
-- stockee. Tout autre libelle reste NULL (l'appel est alors range au mois de
-- son echeance par le suivi mensuel).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "s2_try_date"(value TEXT) RETURNS DATE AS $$
DECLARE
  parsed DATE;
BEGIN
  parsed := to_date(value, 'YYYY-MM-DD');
  -- to_date peut accepter « 2026-02-30 » en le repoussant au mois suivant :
  -- on exige que la date relue s'ecrive exactement comme la saisie.
  IF to_char(parsed, 'YYYY-MM-DD') <> value THEN
    RETURN NULL;
  END IF;
  RETURN parsed;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION "s2_period_bounds"(label TEXT, OUT start_date DATE, OUT end_date DATE) AS $$
DECLARE
  base TEXT := regexp_replace(btrim(COALESCE(label, '')), '-R1$', '');
  q INT;
BEGIN
  start_date := NULL;
  end_date := NULL;
  IF base ~ '^[1-9]\d{3}-\d{2}-\d{2} au [1-9]\d{3}-\d{2}-\d{2}$' THEN
    start_date := "s2_try_date"(substr(base, 1, 10));
    end_date := "s2_try_date"(substr(base, 15, 10));
    IF start_date IS NULL OR end_date IS NULL OR start_date > end_date THEN
      start_date := NULL;
      end_date := NULL;
    END IF;
  ELSIF base ~ '^[1-9]\d{3}-\d{2}$' THEN
    start_date := "s2_try_date"(base || '-01');
    IF start_date IS NOT NULL THEN
      end_date := (start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    END IF;
  ELSIF base ~ '^[1-9]\d{3}-[QqTt][1-4]$' THEN
    q := right(base, 1)::INT;
    start_date := make_date(left(base, 4)::INT, (q - 1) * 3 + 1, 1);
    end_date := (start_date + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
  ELSIF base ~ '^[1-9]\d{3}$' THEN
    start_date := make_date(base::INT, 1, 1);
    end_date := make_date(base::INT, 12, 31);
  END IF;
EXCEPTION WHEN others THEN
  start_date := NULL;
  end_date := NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE "charge_calls" c
SET "period_start" = b.start_date,
    "period_end" = b.end_date
FROM (
  SELECT id, ("s2_period_bounds"(period)).start_date, ("s2_period_bounds"(period)).end_date
  FROM "charge_calls"
  WHERE "period_start" IS NULL
) b
WHERE c."id" = b."id"
  AND b.start_date IS NOT NULL;

UPDATE "charge_call_batches" c
SET "period_start" = b.start_date,
    "period_end" = b.end_date
FROM (
  SELECT id, ("s2_period_bounds"(period)).start_date, ("s2_period_bounds"(period)).end_date
  FROM "charge_call_batches"
  WHERE "period_start" IS NULL
) b
WHERE c."id" = b."id"
  AND b.start_date IS NOT NULL;

-- Rapport : libelles restes sans bornes (visibles dans la sortie de migration).
DO $$
DECLARE
  unreadable INT;
  samples TEXT;
BEGIN
  SELECT count(*) INTO unreadable FROM "charge_calls" WHERE "period_start" IS NULL;
  SELECT string_agg(period, ' | ') INTO samples
  FROM (SELECT DISTINCT period FROM "charge_calls" WHERE "period_start" IS NULL ORDER BY period LIMIT 20) s;
  RAISE NOTICE 'Lot S2 : % appel(s) de charges sans bornes de periode (echantillon : %)', unreadable, COALESCE(samples, '-');
END;
$$;

DROP FUNCTION "s2_period_bounds"(TEXT);
DROP FUNCTION "s2_try_date"(TEXT);

-- ---------------------------------------------------------------------------
-- Rattrapage : statut stocke recalcule a partir des affectations (regle de
-- `computeChargeCallStatus`). « En retard » n'est jamais stocke.
-- ---------------------------------------------------------------------------
UPDATE "charge_calls" c
SET "status" = s.new_status::"ChargeCallStatus"
FROM (
  SELECT c2."id",
         CASE
           WHEN COALESCE(SUM(a."amount"), 0) <= 0 THEN 'PENDING'
           WHEN COALESCE(SUM(a."amount"), 0) < c2."amount" THEN 'PARTIAL'
           ELSE 'PAID'
         END AS new_status
  FROM "charge_calls" c2
  LEFT JOIN "charge_payment_allocations" a ON a."charge_call_id" = c2."id"
  GROUP BY c2."id", c2."amount"
) s
WHERE c."id" = s."id"
  AND c."status"::TEXT <> s.new_status;
