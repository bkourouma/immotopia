-- Migration de DONNEES (spec 040, B1, data-model §3.3) : droits du stock et role
-- Magasinier. Additive et idempotente. Equivalent de
-- prisma/seeds/stock-permissions-seed.ts, pour qu'une base qui applique les
-- migrations (prisma migrate deploy) n'ait pas ses routes de stock en 403 au
-- premier deploiement.
--
-- Aucune decision `role_menu_access` n'est ecrite : les cles de menu sont
-- opaques cote serveur. Les menus hors stock du role Magasinier se coupent une
-- fois, par la plateforme (DEPLOIEMENT.md).

-- 1. Les 10 permissions.
INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'STOCK_VIEW', 'Consulter le stock : articles, lieux, soldes en quantite, mouvements, inventaires, preneurs, bons', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_VALUES_VIEW', 'Voir les valeurs du stock, les indicateurs et les filtres par personne', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_RECEIVE', 'Enregistrer une reception de stock', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_ISSUE', 'Enregistrer une sortie de stock vers un chantier', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_TRANSFER', 'Transferer du stock entre deux lieux', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_COUNT', 'Ouvrir, compter, clore et justifier un inventaire', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_TAKERS_MANAGE', 'Gerer le carnet des preneurs', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_COUNT_VALIDATE', 'Valider ou abandonner un inventaire, ecarter une ligne de comptage', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_DISPOSE', 'Enregistrer un rebut ou un retour fournisseur, retirer une piece jointe', NOW(), NOW()),
  (gen_random_uuid()::text, 'STOCK_ALERTS_VIEW', 'Consulter et traiter les alertes de stock', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- 2. Le role Magasinier (portee agence, global comme les autres roles systeme).
INSERT INTO "roles" ("id", "key", "name", "description", "scope", "created_at", "updated_at")
VALUES (
  gen_random_uuid()::text, 'TENANT_STOREKEEPER', 'Tenant Storekeeper',
  'Magasinier : recoit, sort, transfere et compte le stock, sans acces aux valeurs ni a la comptabilite',
  'TENANT', NOW(), NOW()
)
ON CONFLICT ("key") DO NOTHING;

-- 3. Droits du Magasinier.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" IN (
  'STOCK_VIEW', 'STOCK_RECEIVE', 'STOCK_ISSUE', 'STOCK_TRANSFER', 'STOCK_COUNT', 'STOCK_TAKERS_MANAGE'
)
WHERE r."key" = 'TENANT_STOREKEEPER'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- 4. Report des droits financiers sur TOUS les roles qui les portent. Les
--    roles sont globaux (pas de role propre a une agence) : roles systeme, et
--    roles dont la plateforme a modifie les permissions. Personne ne perd
--    l'acces au stock qu'il avait.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, rp."role_id", np."id", NOW()
FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id"
JOIN "permissions" np ON (
     (op."key" = 'FINANCE_ACCOUNTS_READ'      AND np."key" IN ('STOCK_VIEW', 'STOCK_VALUES_VIEW'))
  OR (op."key" = 'FINANCE_DOCUMENTS_CREATE'   AND np."key" IN ('STOCK_RECEIVE', 'STOCK_ISSUE', 'STOCK_TRANSFER', 'STOCK_COUNT', 'STOCK_TAKERS_MANAGE'))
  OR (op."key" = 'FINANCE_DOCUMENTS_VALIDATE' AND np."key" IN ('STOCK_COUNT_VALIDATE', 'STOCK_DISPOSE', 'STOCK_ALERTS_VIEW'))
)
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Pas d'attribution inconditionnelle aux administrateurs : l'etape 4 suffit.
-- Un role qui n'a plus un droit financier (retire a la main) n'obtient pas son
-- equivalent du stock ; personne n'obtient plus qu'avant (spec B1-R2).
