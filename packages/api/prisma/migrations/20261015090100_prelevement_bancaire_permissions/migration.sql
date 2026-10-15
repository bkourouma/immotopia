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

-- 2. Report sur TOUS les roles qui portent deja les droits de paiement de
--    loyer : qui consulte les paiements consulte les prelevements ; qui
--    enregistre un paiement gere les prelevements. Personne ne recoit plus que
--    ce qu'il a deja.
INSERT INTO "role_permissions" ("id", "role_id", "permission_id", "created_at")
SELECT gen_random_uuid()::text, rp."role_id", np."id", NOW()
FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id"
JOIN "permissions" np ON (
     (op."key" = 'RENTAL_PAYMENTS_VIEW'   AND np."key" = 'RENTAL_DIRECT_DEBIT_VIEW')
  OR (op."key" = 'RENTAL_PAYMENTS_CREATE' AND np."key" IN ('RENTAL_DIRECT_DEBIT_VIEW', 'RENTAL_DIRECT_DEBIT_MANAGE'))
)
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
