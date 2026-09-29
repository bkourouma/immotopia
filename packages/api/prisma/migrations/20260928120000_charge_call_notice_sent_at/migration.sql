-- Anomalie recette (Syndic, programmation des appels de charges) : trace par
-- appel de charges de la date du dernier avis effectivement envoye
-- (e-mail ou WhatsApp), pour rendre le renvoi des avis non envoyes idempotent
-- appel par appel (pas seulement periode par periode). Additive, nullable :
-- aucune donnee existante a completer.
ALTER TABLE "charge_calls" ADD COLUMN IF NOT EXISTS "notice_sent_at" TIMESTAMP(3);
