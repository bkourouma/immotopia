-- Option « AG en direct et visio » (decision du fondateur, 12/11) : amorcage du catalogue.
--
-- Source : DEFAULT_CATALOG (src/lib/subscription/catalog.ts). Idempotent
-- (ON CONFLICT DO NOTHING) : un prix deja modifie par le super-admin n'est pas
-- ecrase. Aucun octroi aux agences existantes : l'option se souscrit.
--
-- 20 000 FCFA HT/mois, sans frais de mise en route, sans capacite (elle ouvre la
-- fonctionnalite SYNDIC_LIVE), vendue avec le pack Syndic. L'Operateur integre
-- l'inclut d'office (code, features.ts) : il ne figure donc pas dans requiresAnyOf.

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'EXT_AG_EN_DIRECT', 'EXTENSION', 'AG en direct et visio',
        'Assemblées générales en direct pour les copropriétaires : vote en ligne et visioconférence',
        20000, 0, ARRAY[]::"ModuleKey"[], NULL, '{"requiresAnyOf":["SYNDIC"]}'::jsonb, true, 170, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
