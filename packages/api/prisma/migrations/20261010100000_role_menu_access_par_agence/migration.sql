-- Accès aux menus : défaut + surcharge par agence.
--
-- Avant : `role_menu_access` était indexée par (role_key, menu_key) seulement ;
-- couper un menu pour TENANT_ADMIN le coupait dans TOUTES les agences, sans
-- recours possible pour une agence.
-- Après : chaque décision porte un `tenant_id` nullable.
--   - NULL, rôle d'agence ou de portail : DÉFAUT valable pour toutes les agences ;
--   - NULL, rôle de scope PLATFORM      : périmètre plateforme ;
--   - agence                            : SURCHARGE pour cette seule agence.
-- Résolution, par (rôle, menu) : la ligne de l'agence l'emporte, à défaut la
-- ligne NULL, à défaut rien (= autorisé).
--
-- Les lignes existantes ne sont ni copiées ni supprimées : elles deviennent le
-- défaut de toutes les agences, ce qui conserve le comportement à l'identique.

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
-- lignes par défaut identiques. Index unique partiel pour le périmètre NULL.
CREATE UNIQUE INDEX "role_menu_access_platform_role_key_menu_key_key"
  ON "role_menu_access"("role_key", "menu_key")
  WHERE "tenant_id" IS NULL;
