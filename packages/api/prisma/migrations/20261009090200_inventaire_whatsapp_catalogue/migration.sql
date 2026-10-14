-- Lot 041 (W-D6, data-model §5.1) : option Inventaire WhatsApp, amorcage du
-- catalogue.
--
-- Source : DEFAULT_CATALOG (src/lib/subscription/catalog.ts). Idempotent
-- (ON CONFLICT DO NOTHING) : un prix deja modifie par le super-admin n'est pas
-- ecrase. Utilise la valeur PHOTOS_INVENTAIRE ajoutee et validee par la
-- migration 20261009090000_inventaire_whatsapp_enums.
--
-- 25 000 FCFA HT/mois par bloc de 500 photos analysees, cumulable, vendu avec
-- les packs Promoteur et Operateur integre. Aucun depassement facture
-- (absente de extensionCodes, subscription-v2-service.ts).

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'EXT_INVENTAIRE_WHATSAPP', 'EXTENSION', 'Inventaire WhatsApp — bloc de 500 photos',
        'Comptage du stock de chantier par photo WhatsApp et IA : 500 photos analysées par mois',
        25000, 0, ARRAY[]::"ModuleKey"[], NULL, '{"requiresAnyOf":["PROMOTEUR","INTEGRE"]}'::jsonb, true, 150, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'PHOTOS_INVENTAIRE', 500 FROM "catalog_items" WHERE "code" = 'EXT_INVENTAIRE_WHATSAPP'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;
