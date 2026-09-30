-- Complement de 20261006130000_syndic_permissions : PLATFORM_SUPER_ADMIN recoit
-- aussi les droits Syndic / releves de gerance (support sur une agence).
-- Idempotent ; sans echec si le role ou les permissions n'existent pas.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" IN ('SYNDIC_VIEW', 'SYNDIC_CREATE', 'SYNDIC_EDIT', 'OWNER_STATEMENTS_VIEW', 'OWNER_STATEMENTS_EDIT')
WHERE r."key" = 'PLATFORM_SUPER_ADMIN'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
