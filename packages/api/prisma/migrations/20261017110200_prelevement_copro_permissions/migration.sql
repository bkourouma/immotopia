-- Migration de DONNEES (spec 042 P4, section 9.2) : droits du prelevement bancaire des coproprietes.
-- Additive et idempotente. Equivalent, pour une base qui applique les
-- migrations (prisma migrate deploy), de l'attribution du seed
-- (prisma/seeds/syndic-permissions-seed.ts).

-- 1. Les 2 permissions.
INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'SYNDIC_DIRECT_DEBIT_VIEW', 'Consulter le compte, les mandats et les remises de prelevement bancaire d''une copropriete (IBAN masque)', NOW(), NOW()),
  (gen_random_uuid()::text, 'SYNDIC_DIRECT_DEBIT_MANAGE', 'Gerer le prelevement bancaire d''une copropriete : IBAN complet dans l''autorisation, scan signe, activation, suspension, revocation, remises et retours', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- 2. Consultation (IBAN masque) : report sur TOUS les roles qui consultent
--    deja le module Syndic.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, rp."role_id", np."id", NOW()
FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."key" = 'SYNDIC_VIEW'
JOIN "permissions" np ON np."key" = 'SYNDIC_DIRECT_DEBIT_VIEW'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- 3. Gestion (IBAN complet dans l'autorisation, scan signe) : reservee aux
--    roles d'administration de l'agence, nommes. Les autres roles la
--    recoivent par l'ecran des roles.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" IN ('SYNDIC_DIRECT_DEBIT_VIEW', 'SYNDIC_DIRECT_DEBIT_MANAGE')
WHERE r."key" IN ('TENANT_ADMIN', 'TENANT_MANAGER')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
