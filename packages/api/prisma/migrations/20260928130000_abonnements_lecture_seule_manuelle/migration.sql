-- Lecture seule manuelle de l'abonnement (Baba, 25/09) : le super-admin peut
-- forcer une agence en lecture seule pour un motif hors impaye (ex. abus,
-- litige), et la lever lui-meme. Jamais posee ni levee par le paiement ou la
-- tache planifiee. Additive : deux colonnes nullables sur "subscriptions".

ALTER TABLE "subscriptions"
  ADD COLUMN "manual_read_only_at" TIMESTAMP(3),
  ADD COLUMN "manual_read_only_reason" TEXT;
