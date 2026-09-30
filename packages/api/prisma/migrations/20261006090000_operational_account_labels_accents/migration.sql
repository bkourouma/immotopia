-- Intitulés du plan de comptes d'exploitation : accents restaurés (recette des packs, BUG-2026-09-30-052).
-- Additive et idempotente : ne remplace QUE l'ancien libellé livré sans accent ; un libellé
-- personnalisé par l'agence n'est jamais écrasé.
UPDATE "chart_of_accounts" SET "account_name" = 'Stocks de matières et fournitures', "updated_at" = now()
  WHERE "scope" = 'OPERATIONS' AND "account_number" = '311' AND "account_name" = 'Stocks de matieres et fournitures';
UPDATE "chart_of_accounts" SET "account_name" = 'Tâcherons', "updated_at" = now()
  WHERE "scope" = 'OPERATIONS' AND "account_number" = '402' AND "account_name" = 'Tacherons';
UPDATE "chart_of_accounts" SET "account_name" = 'Personnel, rémunérations dues', "updated_at" = now()
  WHERE "scope" = 'OPERATIONS' AND "account_number" = '422' AND "account_name" = 'Personnel, remunerations dues';
UPDATE "chart_of_accounts" SET "account_name" = 'Fournisseurs et tâcherons, retenues de garantie', "updated_at" = now()
  WHERE "scope" = 'OPERATIONS' AND "account_number" = '4047' AND "account_name" = 'Fournisseurs et tacherons, retenues de garantie';
UPDATE "chart_of_accounts" SET "account_name" = 'Charges constatées d''avance', "updated_at" = now()
  WHERE "scope" = 'OPERATIONS' AND "account_number" = '476' AND "account_name" = 'Charges constatees d''avance';
