-- Migration de DONNEES (spec 045, abonnement en libre-service) : droit de
-- modifier l'abonnement de l'agence (ajouter un pack ou une extension,
-- programmer ou annuler un retrait). Additive et idempotente. Equivalent, pour
-- une base qui applique les migrations (prisma migrate deploy), de la ligne
-- ajoutee a prisma/seeds/rbac-seed.ts (prefixe TENANT_, donc attribuee au
-- TENANT_ADMIN par le seed).

-- 1. La permission.
INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'TENANT_SUBSCRIPTION_MANAGE', 'Modifier l''abonnement de l''agence : ajouter un pack ou une extension, programmer ou annuler un retrait (engage la facturation)', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- 2. Administrateur d'agence uniquement (decision AL-C1) : ni le gestionnaire,
--    ni l'agent, ni le comptable. Les autres roles la recoivent par l'ecran des
--    roles. Le super-admin la porte comme toute permission (le seed lui donne
--    tout). Sans echec si un role n'existe pas.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" = 'TENANT_SUBSCRIPTION_MANAGE'
WHERE r."key" IN ('TENANT_ADMIN', 'PLATFORM_SUPER_ADMIN')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
