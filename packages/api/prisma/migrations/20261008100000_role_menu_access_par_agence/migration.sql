-- Accès aux menus par agence.
--
-- Avant : `role_menu_access` était indexée par (role_key, menu_key) seulement ;
-- couper un menu pour TENANT_ADMIN le coupait dans TOUTES les agences.
-- Après : chaque décision porte un `tenant_id`. NULL = périmètre plateforme
-- (rôles de scope PLATFORM), sans aucun héritage vers les agences.

-- 1. Colonne, clé étrangère et index.
ALTER TABLE "role_menu_access" ADD COLUMN "tenant_id" TEXT;

ALTER TABLE "role_menu_access"
  ADD CONSTRAINT "role_menu_access_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "role_menu_access_tenant_id_role_key_idx" ON "role_menu_access"("tenant_id", "role_key");

-- 2. Unicité : (tenant_id, role_key, menu_key) remplace (role_key, menu_key).
DROP INDEX "role_menu_access_role_key_menu_key_key";

CREATE UNIQUE INDEX "role_menu_access_tenant_id_role_key_menu_key_key"
  ON "role_menu_access"("tenant_id", "role_key", "menu_key");

-- Postgres tient les NULL pour distincts : l'index ci-dessus n'empêche pas deux
-- lignes plateforme identiques. Index unique partiel pour le périmètre null.
CREATE UNIQUE INDEX "role_menu_access_platform_role_key_menu_key_key"
  ON "role_menu_access"("role_key", "menu_key")
  WHERE "tenant_id" IS NULL;

-- 3. Conserver le comportement actuel à l'identique : les lignes existantes
-- étaient valables pour toutes les agences. On les COPIE pour chaque agence
-- existante, avec le même `enabled`, pour tout rôle qui n'est pas de scope
-- PLATFORM : rôles de scope TENANT, pseudo-rôles de portail (PORTAL_OWNER,
-- PORTAL_RENTER, absents de `roles`) et tout rôle inconnu de `roles`
-- (traité comme TENANT).
INSERT INTO "role_menu_access" ("id", "tenant_id", "role_key", "menu_key", "enabled", "created_at", "updated_at")
SELECT gen_random_uuid()::text, t."id", rma."role_key", rma."menu_key", rma."enabled", rma."created_at", CURRENT_TIMESTAMP
FROM "role_menu_access" rma
CROSS JOIN "tenants" t
WHERE rma."tenant_id" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "roles" r
    WHERE r."key" = rma."role_key"
      AND r."scope" = 'PLATFORM'
  );

-- 4. Supprimer les lignes null devenues copies (celles des rôles PLATFORM
-- restent à null). Même condition qu'à l'étape 3.
DELETE FROM "role_menu_access" rma
WHERE rma."tenant_id" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "roles" r
    WHERE r."key" = rma."role_key"
      AND r."scope" = 'PLATFORM'
  );
