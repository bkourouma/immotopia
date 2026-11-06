-- Migration de DONNEES : octroi des permissions PATRIMOINE_PERSONAL_VIEW et
-- PATRIMOINE_PERSONAL_EDIT au dirigeant d'agence / operateur / pack Patrimoine
-- (TENANT_ADMIN), au proprietaire d'espace particulier (PERSONAL_SPACE_OWNER)
-- et au super-administrateur (PLATFORM_SUPER_ADMIN).
--
-- Les autres collaborateurs d'agence (TENANT_MANAGER, TENANT_AGENT,
-- TENANT_ACCOUNTANT, TENANT_SITE_MANAGER, TENANT_STOREKEEPER) n'en recoivent
-- aucune : les ecrans Valeur nette, Mes actifs, Projections et Entites
-- detentrices restent reserves au dirigeant (et aux roles personnalises qui
-- recevraient explicitement ces permissions).
--
-- Additive et idempotente : corrige le 403 sur les ecrans du module Patrimoine
-- pour TENANT_ADMIN des l'application de `prisma migrate deploy`.

INSERT INTO "roles" ("id", "key", "name", "description", "scope", "created_at", "updated_at")
VALUES (
  gen_random_uuid()::text, 'PERSONAL_SPACE_OWNER', 'Personal Space Owner',
  'Proprietaire d''un espace personnel : donnees personnelles du patrimoine',
  'TENANT', NOW(), NOW()
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'PATRIMOINE_PERSONAL_VIEW', 'View personal (non-real-estate) patrimoine data', NOW(), NOW()),
  (gen_random_uuid()::text, 'PATRIMOINE_PERSONAL_EDIT', 'Edit personal (non-real-estate) patrimoine data', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" IN ('PATRIMOINE_PERSONAL_VIEW', 'PATRIMOINE_PERSONAL_EDIT')
WHERE r."key" IN ('TENANT_ADMIN', 'PERSONAL_SPACE_OWNER', 'PLATFORM_SUPER_ADMIN')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
