-- Spec 043 (signature electronique), decisions du 15/10/2026 :
--  1. capacite SIGNATURES_MENSUELLES incluse SELON LE PACK d'agence (ni les packs
--     Particulier ni Patrimoine) ;
--  2. extension « Signatures electroniques — bloc de 50 », cumulable (quantite de
--     l'element d'abonnement), sans depassement facture.
--
-- VALEURS PROVISOIRES a valider : AGENCE 20, SYNDIC 50, PROMOTEUR 20, INTEGRE 100.
-- PRIX DE L'EXTENSION NON DECIDE (decision fondateur) : 0 FCFA et non vendable
-- (is_sellable = false) ; le super-admin le fixe depuis le catalogue.
--
-- Source : DEFAULT_CATALOG (src/lib/subscription/catalog.ts). Utilise la valeur
-- SIGNATURES_MENSUELLES ajoutee et validee par 20261015100000_signature_enums.
--
-- Idempotent : ON CONFLICT DO NOTHING (une valeur ou un prix deja poses, ou
-- modifies par le super-admin, ne sont pas ecrases). Aucun abonnement n'est
-- modifie : le calcul des droits (getEntitlements) additionne la capacite du pack
-- et celle des extensions souscrites x quantite, lues sur le catalogue.

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'SIGNATURES_MENSUELLES',
       CASE "code" WHEN 'AGENCE' THEN 20 WHEN 'SYNDIC' THEN 50 WHEN 'PROMOTEUR' THEN 20 WHEN 'INTEGRE' THEN 100 END
FROM "catalog_items"
WHERE "code" IN ('AGENCE', 'SYNDIC', 'PROMOTEUR', 'INTEGRE') AND "kind" = 'PACK'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;

INSERT INTO "catalog_items" ("id", "code", "kind", "name", "description", "monthly_price", "setup_price", "modules", "exclusive_group", "rules", "is_sellable", "sort_order", "updated_at")
VALUES (gen_random_uuid()::text, 'EXT_SIGNATURES_SUPPLEMENTAIRES', 'EXTENSION', 'Signatures électroniques — bloc de 50',
        'Signatures électroniques supplémentaires : 50 par mois et par bloc, cumulable',
        0, 0, ARRAY[]::"ModuleKey"[], NULL, '{"requiresAnyOf":["AGENCE","SYNDIC","PROMOTEUR","INTEGRE"]}'::jsonb, false, 160, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "catalog_capacities" ("id", "catalog_item_id", "capacity_key", "amount")
SELECT gen_random_uuid()::text, "id", 'SIGNATURES_MENSUELLES', 50 FROM "catalog_items" WHERE "code" = 'EXT_SIGNATURES_SUPPLEMENTAIRES'
ON CONFLICT ("catalog_item_id", "capacity_key") DO NOTHING;
