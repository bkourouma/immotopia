-- Recette QA2 du module Syndic : evolutions additives du schema.

-- Documents : visibilite explicite au portail des coproprietaires.
ALTER TABLE "syndicate_documents" ADD COLUMN IF NOT EXISTS "visible_to_co_owners" BOOLEAN NOT NULL DEFAULT false;

-- Backfill : seuls ces types etaient visibles au portail jusqu'ici (comportement inchange).
UPDATE "syndicate_documents"
SET "visible_to_co_owners" = true
WHERE "type" IN ('REGULATION', 'GENERAL_MEETING_MINUTES');

-- Copropriete : total de reference des tantiemes generaux (facultatif).
ALTER TABLE "syndicates" ADD COLUMN IF NOT EXISTS "total_general_shares" INTEGER;

-- Relances : cause d'echec d'envoi.
ALTER TABLE "payment_reminders" ADD COLUMN IF NOT EXISTS "failure_code" TEXT;
ALTER TABLE "payment_reminders" ADD COLUMN IF NOT EXISTS "failure_message" TEXT;
