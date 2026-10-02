-- Migration de DONNEES : droit de consulter le journal d'activite de l'agence
-- (ADR-006, specs/023-audit-deux-niveaux, phase 2). Additive et idempotente.
-- Equivalent de prisma/seeds/audit-permissions-seed.ts, pour que toute base qui
-- applique les migrations (prisma migrate deploy) ait la route 403 pour tous,
-- sauf l'administrateur d'agence et le super-admin.

INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'TENANT_AUDIT_VIEW', 'Consulter le journal d''activite de l''agence (qui a fait quoi, quand)', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;

-- Administrateur d'agence et super-admin uniquement (sans echec si un role
-- n'existe pas). Ni le gestionnaire, ni l'agent, ni le comptable.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, r."id", p."id", NOW()
FROM "roles" r
JOIN "permissions" p ON p."key" = 'TENANT_AUDIT_VIEW'
WHERE r."key" IN ('TENANT_ADMIN', 'PLATFORM_SUPER_ADMIN')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
