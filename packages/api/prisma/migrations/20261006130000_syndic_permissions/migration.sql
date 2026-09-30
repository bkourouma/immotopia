-- Migration de DONNEES (BUG-2026-09-30-096) : droits dedies du module Syndic et
-- des releves de gerance. Additive et idempotente ; ne supprime que le lien
-- TENANT_AGENT x USERS_VIEW. Equivalent du script
-- scripts/backfill-syndic-permissions.ts, pour que toute base qui applique les
-- migrations (prisma migrate deploy) n'ait pas ses routes Syndic en 403.

-- 1. Les 5 permissions.
INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'SYNDIC_VIEW', 'Consulter le module Syndic (coproprietes, lots, appels, finances, assemblees)', NOW(), NOW()),
  (gen_random_uuid()::text, 'SYNDIC_CREATE', 'Creer une copropriete, des lots ou des appels de charges', NOW(), NOW()),
  (gen_random_uuid()::text, 'SYNDIC_EDIT', 'Modifier le module Syndic : encaissements, relances, fonds, prestataires, factures, assemblees', NOW(), NOW()),
  (gen_random_uuid()::text, 'OWNER_STATEMENTS_VIEW', 'Consulter les releves de gerance des proprietaires', NOW(), NOW()),
  (gen_random_uuid()::text, 'OWNER_STATEMENTS_EDIT', 'Creer, recalculer et envoyer les releves de gerance', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- 2. Administrateur et gestionnaire : les 5 droits (sans echec si le role n'existe pas).
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" IN ('SYNDIC_VIEW', 'SYNDIC_CREATE', 'SYNDIC_EDIT', 'OWNER_STATEMENTS_VIEW', 'OWNER_STATEMENTS_EDIT')
WHERE r."key" IN ('TENANT_ADMIN', 'TENANT_MANAGER')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- 3. Roles d'agence personnalises (hors roles systeme) : reporter l'equivalent
--    des droits Biens qui ouvraient ces routes, pour ne pas couper leur acces.
--    TENANT_AGENT est exclu a dessein : c'est l'objet du correctif.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT DISTINCT gen_random_uuid()::text, rp."role_id", np."id", NOW()
FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id"
JOIN "roles" r ON r."id" = rp."role_id"
JOIN "permissions" np ON np."key" IN (
  CASE op."key"
    WHEN 'PROPERTIES_VIEW' THEN 'SYNDIC_VIEW'
    WHEN 'PROPERTIES_CREATE' THEN 'SYNDIC_CREATE'
    WHEN 'PROPERTIES_EDIT' THEN 'SYNDIC_EDIT'
  END,
  CASE op."key"
    WHEN 'PROPERTIES_VIEW' THEN 'OWNER_STATEMENTS_VIEW'
    WHEN 'PROPERTIES_EDIT' THEN 'OWNER_STATEMENTS_EDIT'
  END
)
WHERE op."key" IN ('PROPERTIES_VIEW', 'PROPERTIES_CREATE', 'PROPERTIES_EDIT')
  AND r."scope" = 'TENANT'
  AND r."key" NOT IN ('TENANT_AGENT', 'TENANT_ACCOUNTANT')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- 4. L'Agent ne liste plus l'ensemble des collaborateurs.
DELETE FROM "role_permissions"
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "key" = 'TENANT_AGENT')
  AND "permission_id" IN (SELECT "id" FROM "permissions" WHERE "key" = 'USERS_VIEW');
