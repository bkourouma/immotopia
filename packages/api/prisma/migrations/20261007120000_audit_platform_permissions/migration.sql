-- Migration de DONNEES : droits du journal d'audit de la PLATEFORME (ADR-006,
-- specs/023-audit-deux-niveaux, phase 4). Additive et idempotente. Equivalent de
-- prisma/seeds/audit-permissions-seed.ts pour toute base qui applique les
-- migrations sans rejouer le seed.
--
-- Jusqu'ici `GET /api/admin/audit` etait garde par PLATFORM_TENANTS_VIEW. La
-- consultation devient PLATFORM_AUDIT_VIEW, et l'export PLATFORM_AUDIT_EXPORT.

INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'PLATFORM_AUDIT_VIEW', 'Consulter le journal d''audit de la plateforme (toutes les agences et les actions de plateforme)', NOW(), NOW()),
  (gen_random_uuid()::text, 'PLATFORM_AUDIT_EXPORT', 'Exporter le journal d''audit de la plateforme en CSV', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- Consultation : le super-admin, et tout role qui avait deja PLATFORM_TENANTS_VIEW
-- (l'ancienne garde de la route), pour ne couper l'acces a personne.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT DISTINCT gen_random_uuid()::text, rp."role_id", np."id", NOW()
FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."key" = 'PLATFORM_TENANTS_VIEW'
JOIN "permissions" np ON np."key" = 'PLATFORM_AUDIT_VIEW'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" = 'PLATFORM_AUDIT_VIEW'
WHERE r."key" = 'PLATFORM_SUPER_ADMIN'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Export : le super-admin seulement.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" = 'PLATFORM_AUDIT_EXPORT'
WHERE r."key" = 'PLATFORM_SUPER_ADMIN'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
