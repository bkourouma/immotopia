-- Pack Patrimoine (lot P1, decisions du 28/09/2026) : amorcage du catalogue.
--
-- Source : DEFAULT_CATALOG (src/lib/subscription/catalog.ts). Idempotent
-- (ON CONFLICT DO NOTHING) : une offre deja modifiee par le super-admin n'est
-- pas ecrasee ; `npm run db:seed:catalog` realigne ensuite sur la meme source.
--
-- Essentiel : 9 900 FCFA HT/mois, 10 biens detenus (particuliers, diaspora).
-- Pro       : 29 900 FCFA HT/mois, 100 biens detenus (entreprises, institutionnels).
-- Les deux portent rules.tierGroup = PATRIMOINE : ils ne se cumulent pas.
-- Bloc de 10 biens : 9 900 avec l'Essentiel (990 le bien) ; le depassement du
-- Pro est facture 2 990 / 10 = 299 FCFA le bien (regle byHeldPacks).

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'PATRIMOINE_ESSENTIEL', 'PACK', 'Patrimoine Essentiel', 'Particuliers et diaspora — 10 biens détenus en propre, loués ou non, gestion locative directe comprise, sans mandat pour un tiers', 9900, 30000, ARRAY['MODULE_PATRIMOINE']::"ModuleKey"[], NULL, '{"tierGroup":"PATRIMOINE"}'::jsonb, true, 50, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'BIENS_DETENUS', 10 FROM "catalog_items" WHERE "code" = 'PATRIMOINE_ESSENTIEL'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'PATRIMOINE_PRO', 'PACK', 'Patrimoine Pro', 'Entreprises et institutionnels — 100 biens détenus en propre, loués ou non, gestion locative directe comprise, sans mandat pour un tiers', 29900, 90000, ARRAY['MODULE_PATRIMOINE']::"ModuleKey"[], NULL, '{"tierGroup":"PATRIMOINE"}'::jsonb, true, 60, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'BIENS_DETENUS', 100 FROM "catalog_items" WHERE "code" = 'PATRIMOINE_PRO'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'EXT_BIENS_10', 'EXTENSION', 'Bloc de 10 biens détenus', '990 FCFA le bien avec Patrimoine Essentiel ; le dépassement du Pro est facturé 299 FCFA le bien', 9900, 0, ARRAY[]::"ModuleKey"[], NULL, '{"byHeldPacks":[{"anyOf":["PATRIMOINE_PRO"],"monthlyPrice":2990}],"requiresAnyOf":["PATRIMOINE_ESSENTIEL"]}'::jsonb, true, 140, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'BIENS_DETENUS', 10 FROM "catalog_items" WHERE "code" = 'EXT_BIENS_10'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'SETUP_PATRIMOINE_ESSENTIEL', 'SETUP', 'Mise en route accompagnée — Patrimoine Essentiel', 'Frais uniques, facultatifs', 0, 30000, ARRAY[]::"ModuleKey"[], NULL, '{"requiresAnyOf":["PATRIMOINE_ESSENTIEL"]}'::jsonb, true, 250, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'SETUP_PATRIMOINE_PRO', 'SETUP', 'Mise en route accompagnée — Patrimoine Pro', 'Frais uniques, facultatifs', 0, 90000, ARRAY[]::"ModuleKey"[], NULL, '{"requiresAnyOf":["PATRIMOINE_PRO"]}'::jsonb, true, 260, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
