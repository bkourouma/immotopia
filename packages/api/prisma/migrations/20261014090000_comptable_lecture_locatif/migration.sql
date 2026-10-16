-- Migration de DONNEES : droits de lecture de la gestion locative pour le role
-- Comptable (TENANT_ACCOUNTANT). Additive et idempotente. Equivalent de
-- ACCOUNTANT_RENTAL_READ_PERMISSION_KEYS (prisma/seeds/rental-permissions-seed.ts)
-- appliquee par rbac-seed.ts : bootstrap.sh saute le seed RBAC quand il est
-- complet, donc une base deja amorcee (staging, production) ne recevait jamais
-- ces droits. Lecture seule : aucune ecriture locative n'est accordee.
-- Aucun schema n'est altere.

-- 1. Les 5 permissions (deja presentes sur une base amorcee ; creees sinon).
INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'RENTAL_LEASES_VIEW', 'View rental leases', NOW(), NOW()),
  (gen_random_uuid()::text, 'RENTAL_INSTALLMENTS_VIEW', 'View rental installments', NOW(), NOW()),
  (gen_random_uuid()::text, 'RENTAL_PAYMENTS_VIEW', 'View rental payments', NOW(), NOW()),
  (gen_random_uuid()::text, 'RENTAL_PENALTIES_VIEW', 'View rental penalties', NOW(), NOW()),
  (gen_random_uuid()::text, 'RENTAL_DEPOSITS_VIEW', 'View rental security deposits', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- 2. Attribution au Comptable (sans effet si le role n'existe pas).
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" IN (
  'RENTAL_LEASES_VIEW', 'RENTAL_INSTALLMENTS_VIEW', 'RENTAL_PAYMENTS_VIEW',
  'RENTAL_PENALTIES_VIEW', 'RENTAL_DEPOSITS_VIEW'
)
WHERE r."key" = 'TENANT_ACCOUNTANT'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
