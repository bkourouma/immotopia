-- Migration de DONNEES (spec 041, W2, data-model §3) : role Chef de chantier.
-- Additive et idempotente. Equivalent de prisma/seeds/site-manager-role-seed.ts.
-- Suppose les permissions STOCK_* du lot 040 deja presentes
-- (20261008090200_controle_stock_permissions).
--
-- Le role ne porte QUE STOCK_COUNT (pas STOCK_VIEW : aveugle strict, decision
-- du Pilote du 04/10, spec W2-R1). Aucune decision `role_menu_access` n'est
-- ecrite : les menus hors stock se coupent une fois, par la plateforme
-- (DEPLOIEMENT.md), comme pour le Magasinier.

INSERT INTO "roles" ("id", "key", "name", "description", "scope", "created_at", "updated_at")
VALUES (
  gen_random_uuid()::text, 'TENANT_SITE_MANAGER', 'Tenant Site Manager',
  'Chef de chantier : compte le stock de ses chantiers, notamment par WhatsApp, sans valider ni acceder aux valeurs',
  'TENANT', NOW(), NOW()
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" = 'STOCK_COUNT'
WHERE r."key" = 'TENANT_SITE_MANAGER'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "permissions" WHERE "key" = 'STOCK_COUNT') <> 1 THEN
    RAISE EXCEPTION 'Spec 041 : permission STOCK_COUNT absente (migration du lot 040 non appliquee).';
  END IF;
END $$;
