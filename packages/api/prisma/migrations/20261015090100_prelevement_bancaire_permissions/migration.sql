-- Migration de DONNEES (spec 042, PB4-R1) : droits du prelevement bancaire.
-- Additive et idempotente. Equivalent, pour une base qui applique les
-- migrations (prisma migrate deploy), de l'attribution du seed de
-- developpement (prefixe RENTAL_).

-- 1. Les 2 permissions.
INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'RENTAL_DIRECT_DEBIT_VIEW', 'Consulter les creanciers et les mandats de prelevement bancaire (IBAN masque)', NOW(), NOW()),
  (gen_random_uuid()::text, 'RENTAL_DIRECT_DEBIT_MANAGE', 'Gerer les creanciers et les mandats de prelevement bancaire : IBAN complet dans l''autorisation, scan signe, activation, suspension, revocation', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- 2. Consultation (IBAN masque) : report sur TOUS les roles qui consultent
--    deja les paiements de loyer.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, rp."role_id", np."id", NOW()
FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."key" = 'RENTAL_PAYMENTS_VIEW'
JOIN "permissions" np ON np."key" = 'RENTAL_DIRECT_DEBIT_VIEW'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- 3. Gestion (IBAN complet dans l'autorisation, scan signe) : reservee aux
--    roles d'administration de l'agence, nommes. Un role qui enregistre
--    seulement des encaissements n'accede pas aux IBAN (audit de securite du
--    lot P1). Les autres roles la recoivent par l'ecran des roles.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" IN ('RENTAL_DIRECT_DEBIT_VIEW', 'RENTAL_DIRECT_DEBIT_MANAGE')
WHERE r."key" IN ('TENANT_ADMIN', 'TENANT_MANAGER')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
