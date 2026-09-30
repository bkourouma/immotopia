-- Complément de 20261006090000 (BUG-2026-09-30-076) : autres intitulés de comptes livrés sans accents.
-- Additive et idempotente : ne remplace QUE l'ancien libellé sans accent ; un libellé personnalisé
-- par l'agence n'est jamais écrasé.
UPDATE "chart_of_accounts" SET "account_name" = 'Variations des stocks de biens achetés', "updated_at" = now()
  WHERE "scope" = 'OPERATIONS' AND "account_number" = '603' AND "account_name" = 'Variations des stocks de biens achetes';
UPDATE "chart_of_accounts" SET "account_name" = 'Autres impôts et contributions retenus à la source', "updated_at" = now()
  WHERE "scope" = 'OPERATIONS' AND "account_name" = 'Autres impots et contributions retenus a la source';
UPDATE "chart_of_accounts" SET "account_name" = 'Entretien, réparations et maintenance', "updated_at" = now()
  WHERE "scope" = 'SYNDICATE' AND "account_number" = '624' AND "account_name" = 'Entretien, reparations et maintenance';
