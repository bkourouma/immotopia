-- Lot 4A (espace particulier en libre-service) : amorcage du catalogue.
--
-- Source : DEFAULT_CATALOG (src/lib/subscription/catalog.ts). Idempotent
-- (ON CONFLICT DO NOTHING) : une offre deja modifiee par le super-admin n'est
-- pas ecrasee ; `npm run db:seed:catalog` realigne ensuite sur la meme source.
--
-- PROVISOIRE : le prix de Particulier Plus (2 900 FCFA HT/mois) et les
-- plafonds d'actifs (10 en gratuit, 100 en Plus) sont des valeurs de depart.
-- Le produit les ajuste dans le catalogue (updateCatalogItem, ecran
-- super-admin) SANS nouvelle migration ; les abonnements en cours gardent
-- leur prix fige (SubscriptionItem).
--
-- Gratuit : 0 FCFA, 10 actifs. Plus : 2 900 FCFA HT/mois, 100 actifs.
-- Les deux portent rules.tierGroup = PARTICULIER : ils ne se cumulent pas.
-- Ils ouvrent MODULE_PATRIMOINE (fonctionnalites CORE, RENTAL, PATRIMOINE).
-- 'ACTIFS' (CapacityKey) est ajoute par 20261004220000_particulier_enums.

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'PARTICULIER_GRATUIT', 'PACK', 'Particulier Gratuit', 'Espace personnel gratuit — jusqu’à 10 actifs de patrimoine (immobilier, placements, prêts…), gestion locative directe comprise', 0, 0, ARRAY['MODULE_PATRIMOINE']::"ModuleKey"[], NULL, '{"tierGroup":"PARTICULIER"}'::jsonb, true, 70, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'ACTIFS', 10 FROM "catalog_items" WHERE "code" = 'PARTICULIER_GRATUIT'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'PARTICULIER_PLUS', 'PACK', 'Particulier Plus', 'Espace personnel payant — jusqu’à 100 actifs de patrimoine, gestion locative directe comprise', 2900, 0, ARRAY['MODULE_PATRIMOINE']::"ModuleKey"[], NULL, '{"tierGroup":"PARTICULIER"}'::jsonb, true, 80, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'ACTIFS', 100 FROM "catalog_items" WHERE "code" = 'PARTICULIER_PLUS'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;
